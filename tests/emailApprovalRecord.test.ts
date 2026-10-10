// G-3 step 3: sending a customer email is recorded, and the branch that
// was already there would have made it LESS safe.
//
// THE TRAP IN THIS STEP. Phase 2B wrote a send_email branch in the
// approvals route that calls sendDealerEmail directly. That was right
// for the shape it was written for - a note to a colleague - and wrong
// for a marketing email to a customer, because sendDealerEmail skips
// everything the /api/email/send route does: the recipient-on-record
// check, the suppression list, the business address and unsubscribe
// footer that sendMarketingEmail adds, the misleading-subject rule, the
// unsupported-link check, the duplicate window and the idempotency
// claim.
//
// Routing the customer card through that branch would have replaced a
// browser-enforced card with a server-enforced path that checked LESS.
// So the route's work was extracted instead, and the branch now splits
// on recipient kind.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { code } from "./helpers/source";

type Row = Record<string, any>;

const sendApprovedEmail = vi.fn(async (..._a: any[]) => ({ ok: true }));
vi.mock("@/lib/email/sendApprovedEmail", () => ({
  sendApprovedEmail: (...a: any[]) => sendApprovedEmail(...a),
}));
const sendDealerEmail = vi.fn(async (..._a: any[]) => ({ success: true, via: "resend" }));
vi.mock("@/lib/email/sendDealerEmail", () => ({
  sendDealerEmail: (...a: any[]) => sendDealerEmail(...a),
}));

let tables: Record<string, Row[]>;
let writes: { table: string; values: Row }[];

function db(): any {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, order: () => api, limit: () => api, in: () => api, is: () => api, gte: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (v: Row) => ((op = "insert"), (values = v), writes.push({ table, values: v }), api),
      update: (v: Row) => ((op = "update"), (values = v), writes.push({ table, values: v }), api),
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { PATCH as approvePatch } from "@/app/api/approvals/[id]/route";

const approve = (id: string) =>
  approvePatch(
    new Request(`https://hawlai.online/api/approvals/${id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }),
    { params: Promise.resolve({ id }) } as any
  );

const row = (details: Row) => [{ id: "ap-1", dealership_id: "d1", status: "pending", action_type: "send_email", action_details: details, amount: null }];

beforeEach(() => {
  sendApprovedEmail.mockClear();
  sendDealerEmail.mockClear();
  writes = [];
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "Test Business", owner_id: "u1" }],
    team_members: [],
    pending_approvals: [],
  };
});

describe("a customer email goes through the FULLY GUARDED path", () => {
  it("APPROVING CALLS sendApprovedEmail, NOT sendDealerEmail", async () => {
    // The whole point of this step. sendDealerEmail skips the consent
    // check, the footer, the subject rule, the link check, the duplicate
    // window and the idempotency claim.
    tables.pending_approvals = row({ to: "asha@example.com", subject: "Diwali", body: "hello", recipient_kind: "lead" });
    const res = await approve("ap-1");
    expect(res.status).toBe(200);
    expect(sendApprovedEmail).toHaveBeenCalledTimes(1);
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("THE ROW'S REQUEST ID IS REUSED, so two presses cannot send twice", async () => {
    // A fresh id at the press would defeat the claim it exists to take:
    // two presses would become two different sends (migration 208).
    tables.pending_approvals = row({ to: "asha@example.com", subject: "Diwali", body: "hello", recipient_kind: "lead", request_id: "chat-abc" });
    await approve("ap-1");
    expect((sendApprovedEmail.mock.calls[0] as any[])[2].request_id).toBe("chat-abc");
  });

  it("the visual draft is passed through, not flattened to plain text", async () => {
    const draft = { subject: "Diwali", headline: "h", intro: "i", bullets: ["a"], body: "b" };
    tables.pending_approvals = row({ to: "asha@example.com", subject: "Diwali", draft, recipient_kind: "customer" });
    await approve("ap-1");
    expect((sendApprovedEmail.mock.calls[0] as any[])[2].draft).toEqual(draft);
  });

  it("A REFUSED SEND DOES NOT MARK THE APPROVAL APPROVED", async () => {
    sendApprovedEmail.mockResolvedValueOnce({ ok: false, status: 400, error: "Not sent: asha@example.com has unsubscribed from this business's emails." } as any);
    tables.pending_approvals = row({ to: "asha@example.com", subject: "Diwali", body: "hello", recipient_kind: "lead" });
    const res = await approve("ap-1");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsubscribed/);
    expect(writes.filter((w) => w.table === "pending_approvals")).toEqual([]);
  });

  it("A DOUBLE PRESS COMES BACK AS 409, not as a failure", async () => {
    // 400 and "couldn't be sent" reads as a failure and invites a third
    // press.
    sendApprovedEmail.mockResolvedValueOnce({ ok: false, status: 409, error: "already sent", duplicate: true } as any);
    tables.pending_approvals = row({ to: "asha@example.com", subject: "Diwali", body: "hello", recipient_kind: "lead" });
    const res = await approve("ap-1");
    expect(res.status).toBe(409);
    expect((await res.json()).duplicate).toBe(true);
  });
});

describe("a note to a colleague is NOT a marketing email", () => {
  it("TEAM MAIL STILL SENDS DIRECTLY, with no unsubscribe footer", async () => {
    // A dated, approved decision (2026-09-14, Part 1 step 3) with two
    // tests encoding it. Caught by tests/approvalExecution.test.ts when
    // this branch first sent everything through the marketing path.
    tables.pending_approvals = row({ to: "colleague@example.com", subject: "Stock check", body: "Can you check?", recipient_kind: "team" });
    const res = await approve("ap-1");
    expect(res.status).toBe(200);
    expect(sendDealerEmail).toHaveBeenCalledTimes(1);
    expect(sendApprovedEmail).not.toHaveBeenCalled();
  });

  it("and an unknown kind takes the GUARDED path, not the direct one", async () => {
    // The default has to be the safe one. A row written by a future
    // producer that forgets recipient_kind must not get the internal-mail
    // shortcut.
    tables.pending_approvals = row({ to: "asha@example.com", subject: "Diwali", body: "hello" });
    await approve("ap-1");
    expect(sendApprovedEmail).toHaveBeenCalledTimes(1);
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });
});

describe("the guards live with the work, not in the route", () => {
  it("THE ROUTE RE-IMPLEMENTS NONE OF THEM", () => {
    const route = code("src/app/api/email/send/route.ts");
    expect(route).toMatch(/sendApprovedEmail\(/);
    for (const guard of ["recipientOnRecord", "misleadingSubject", "recentDuplicateSend", "findUnsupportedLinks", "sendMarketingEmail", "registerPiece"]) {
      expect(route, `${guard} should live with the work, not in the route`).not.toMatch(new RegExp(guard));
    }
  });

  it("and the extracted module has all of them", () => {
    const src = code("src/lib/email/sendApprovedEmail.ts");
    for (const guard of ["recipientOnRecord", "misleadingSubject", "recentDuplicateSend", "findUnsupportedLinks", "sendMarketingEmail", "registerPiece"]) {
      expect(src, `${guard} missing from the extracted send path`).toMatch(new RegExp(guard));
    }
  });

  it("THE ORDER IS KEPT: duplicate window before the sender, link check before tracking", () => {
    // The window first so a double press costs nothing; the link check
    // before attribution so an unverified link is refused outright
    // rather than quietly tracked.
    const src = code("src/lib/email/sendApprovedEmail.ts");
    expect(src.indexOf("recentDuplicateSend(")).toBeLessThan(src.indexOf("sendMarketingEmail("));
    expect(src.indexOf("findUnsupportedLinks(")).toBeLessThan(src.indexOf("markTrackedLinks("));
  });
});
