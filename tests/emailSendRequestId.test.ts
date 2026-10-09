// The request id survives the whole route, on BOTH of its paths.
//
// WHY THIS FILE EXISTS: the first version of this check was a grep for
// `sendMarketingEmail(...requestId)`, and two mutations survived it. The
// route has two call sites - a visual draft and plain words - and a
// pattern match is satisfied by either one, so dropping the id from one
// path broke nothing. The working path hid the broken one.
//
// So this runs the route and reads what the sender was actually handed.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

/** Every argument sendMarketingEmail was called with, in order. */
let calls: any[][] = [];
let sendResult: Row = { success: true, via: "resend" };

vi.mock("@/lib/email/sendMarketingEmail", () => ({
  sendMarketingEmail: (...a: any[]) => (calls.push(a), Promise.resolve(sendResult)),
  NO_ADDRESS_ERROR: "no address",
}));

// Everything the route checks before it sends, answered permissively so
// each test is about the id and nothing else.
vi.mock("@/lib/email/consent", () => ({ recipientOnRecord: async () => "lead" }));
vi.mock("@/lib/email/duplicateSend", () => ({ recentDuplicateSend: async () => ({ duplicate: false }) }));
vi.mock("@/lib/claims/businessFacts", () => ({ gatherBusinessFactsSafely: async () => ({ businessName: "Test Business" }) }));
vi.mock("@/lib/claims/claimCheck", () => ({ findUnsupportedLinks: () => [] }));
vi.mock("@/lib/expertise/channelRules", () => ({ misleadingSubject: () => null }));
vi.mock("@/lib/attribution/contentLink", () => ({ isPieceId: () => false, markTrackedLinks: (t: string) => ({ text: t }) }));
vi.mock("@/lib/attribution/pieces", () => ({ registerPiece: async () => null }));

let signedIn: Row | null = { id: "u1" };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: signedIn } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: table === "profiles" ? { dealership_id: "d1" } : { dealership_name: "Test Business" },
          }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/email/send/route";

const post = (body: Row) =>
  POST(new Request("http://localhost/api/email/send", { method: "POST", body: JSON.stringify(body) }));

/** sendMarketingEmail's 5th argument is the idempotency key. */
const keyPassed = () => calls[0]?.[4];

beforeEach(() => {
  calls = [];
  sendResult = { success: true, via: "resend" };
  signedIn = { id: "u1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the plain-words path", () => {
  it("PASSES THE REQUEST ID THROUGH TO THE SENDER", async () => {
    const res = await post({ to: "asha@example.com", subject: "Diwali offer", body: "hello", request_id: "lead-abc" });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(keyPassed()).toBe("lead-abc");
  });

  it("with no id, null is passed — not undefined, and not a made-up one", async () => {
    // Null is what keeps the old insert-after-success path working for
    // callers that have no concept of a press.
    await post({ to: "asha@example.com", subject: "s", body: "b" });
    expect(keyPassed()).toBeNull();
  });
});

describe("the visual-draft path", () => {
  it("PASSES THE REQUEST ID THROUGH TOO", async () => {
    // This is the path a mutation proved was untested: the other one
    // kept the grep happy.
    const res = await post({ to: "asha@example.com", draft: { subject: "Diwali", body: "hi" }, request_id: "chat-xyz" });
    expect(res.status).toBe(200);
    expect(keyPassed()).toBe("chat-xyz");
  });

  it("and null when the caller sent none", async () => {
    await post({ to: "asha@example.com", draft: { subject: "Diwali", body: "hi" } });
    expect(keyPassed()).toBeNull();
  });
});

describe("what the route does with the id before sending", () => {
  it("A BLANK OR WHITESPACE ID IS TREATED AS NO KEY", async () => {
    // An empty string from a client that meant to send nothing must not
    // become a claim that collides with the next empty string.
    await post({ to: "a@b.com", subject: "s", body: "b", request_id: "   " });
    expect(keyPassed()).toBeNull();
    calls = [];
    await post({ to: "a@b.com", subject: "s", body: "b", request_id: "" });
    expect(keyPassed()).toBeNull();
  });

  it("a non-string id is ignored rather than coerced", async () => {
    await post({ to: "a@b.com", subject: "s", body: "b", request_id: 12345 });
    expect(keyPassed()).toBeNull();
  });

  it("an absurdly long id is truncated, not sent whole", async () => {
    // idempotency_key is unconstrained text in the database; a client
    // bug should not be able to write a megabyte into it.
    await post({ to: "a@b.com", subject: "s", body: "b", request_id: "x".repeat(5000) });
    expect(String(keyPassed())).toHaveLength(100);
  });

  it("surrounding whitespace is trimmed, so the same press matches itself", async () => {
    await post({ to: "a@b.com", subject: "s", body: "b", request_id: "  lead-abc  " });
    expect(keyPassed()).toBe("lead-abc");
  });
});

describe("a duplicate refusal comes back as 409", () => {
  it("NOT 400 — a failure reading invites a third press", async () => {
    sendResult = { success: false, duplicate: true, error: "already sent" };
    const res = await post({ to: "a@b.com", subject: "s", body: "b", request_id: "lead-abc" });
    expect(res.status).toBe(409);
    expect((await res.json()).duplicate).toBe(true);
  });

  it("an ordinary failure is still 400", async () => {
    sendResult = { success: false, error: "something else" };
    const res = await post({ to: "a@b.com", subject: "s", body: "b" });
    expect(res.status).toBe(400);
    expect((await res.json()).duplicate).toBeUndefined();
  });
});
