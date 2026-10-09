// The claim is actually wired into the send path, proved by running it.
//
// Separate from sendClaim.test.ts because this file has to mock the real
// senders, and the unit tests next door deliberately do not.
//
// WHAT THIS PINS, and why each one is worth a test: the row exists
// BEFORE the sender is called (the whole point of migration 208), a
// retry never reaches the sender at all, a deliberate second press
// does, and a caller with no key keeps the old insert-after-success
// behaviour unchanged.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

/** What the sender saw at the moment it was called. */
let rowsWhenSent: Row[][] = [];
let gmailOk = true;
let resendOk = true;

const rows: Row[] = [];

const gmailSend = vi.fn(async (..._a: any[]) => {
  rowsWhenSent.push(rows.map((r) => ({ ...r })));
  return gmailOk ? { success: true } : { success: false, error: "gmail refused" };
});
vi.mock("@/lib/agents/gmailAgent", () => ({ sendEmail: (...a: any[]) => gmailSend(...a) }));

const resendSend = vi.fn(async (..._a: any[]) => {
  rowsWhenSent.push(rows.map((r) => ({ ...r })));
  return resendOk
    ? { success: true, resendMessageId: "msg-7" }
    : { success: false, error: "resend refused" };
});
vi.mock("@/lib/email/resendClient", () => ({
  sendViaResend: (...a: any[]) => resendSend(...a),
  senderDisplayName: (n: string) => n,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.com" } }, error: null }) } } }),
}));

import { sendDealerEmail } from "@/lib/email/sendDealerEmail";

/** gmail_email decides `via`, which the claim has to know before the send. */
let gmailConnected = false;

function db() {
  return {
    from(table: string) {
      if (table === "dealerships") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { gmail_email: gmailConnected ? "shop@gmail.com" : null, dealership_name: "Test Business", owner_id: "o1" },
              }),
            }),
          }),
        };
      }
      // email_sends — enforcing migration 208's partial unique index.
      return {
        insert(row: Row) {
          const clash =
            row.idempotency_key != null &&
            rows.some(
              (r) => r.dealership_id === row.dealership_id && r.idempotency_key === row.idempotency_key && r.handoff_state !== "failed"
            );
          return {
            select: () => ({
              single: async () => {
                if (clash) return { data: null, error: { code: "23505", message: "duplicate key" } };
                const saved = { id: `row${rows.length + 1}`, ...row };
                rows.push(saved);
                return { data: { id: saved.id }, error: null };
              },
            }),
            then: (res: any) => {
              rows.push({ id: `row${rows.length + 1}`, ...row });
              return Promise.resolve({ error: null }).then(res);
            },
          };
        },
        update: (patch: Row) => ({
          eq: async (_k: string, id: string) => {
            const r = rows.find((x) => x.id === id);
            if (r) Object.assign(r, patch);
            return { error: null };
          },
        }),
      };
    },
  };
}

const send = (key?: string | null) =>
  sendDealerEmail(db(), "d1", "asha@example.com", "Diwali offer", "body", key === undefined ? {} : { idempotencyKey: key });

beforeEach(() => {
  rows.length = 0;
  rowsWhenSent = [];
  gmailSend.mockClear();
  resendSend.mockClear();
  gmailConnected = false;
  gmailOk = true;
  resendOk = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("with a request id", () => {
  it("THE ROW EXISTS BEFORE THE SENDER IS CALLED", async () => {
    // The old code inserted after success, which is exactly why no
    // unique constraint could ever have won the race.
    const r = await send("req-1");
    expect(r.success).toBe(true);
    expect(rowsWhenSent).toHaveLength(1);
    expect(rowsWhenSent[0]).toHaveLength(1);
    expect(rowsWhenSent[0][0].handoff_state).toBe("claimed");
    expect(rowsWhenSent[0][0].idempotency_key).toBe("req-1");
  });

  it("and it becomes 'sent' afterwards, with the resend id on the same row", async () => {
    await send("req-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].handoff_state).toBe("sent");
    expect(rows[0].resend_message_id).toBe("msg-7");
  });

  it("A RETRY NEVER REACHES THE SENDER", async () => {
    // Not "sends and then notices" — the second press must cost nothing
    // and deliver nothing.
    await send("req-1");
    expect(resendSend).toHaveBeenCalledTimes(1);

    const retry = await send("req-1");
    expect(retry.success).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it("a deliberate second press, with a new id, does send", async () => {
    await send("req-1");
    const second = await send("req-2");
    expect(second.success).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(2);
  });

  it("A FAILED SEND IS MARKED 'failed' AND CAN BE RETRIED WITH THE SAME ID", async () => {
    resendOk = false;
    const first = await send("req-1");
    expect(first.success).toBe(false);
    expect(first.duplicate).toBeFalsy();
    expect(rows[0].handoff_state).toBe("failed");

    resendOk = true;
    const retry = await send("req-1");
    expect(retry.success).toBe(true);
    // Nothing deleted: the failure stays on record beside the success.
    expect(rows).toHaveLength(2);
    expect(rows[0].handoff_state).toBe("failed");
    expect(rows[1].handoff_state).toBe("sent");
  });

  it("the gmail path claims too, with via decided before the send", async () => {
    // via is NOT NULL with a CHECK, so a row written before the send has
    // to already know which sender this is. It does — gmail_email has
    // just been read.
    gmailConnected = true;
    const r = await send("req-1");
    expect(r.via).toBe("gmail");
    expect(rowsWhenSent[0][0].via).toBe("gmail");
    expect(rowsWhenSent[0][0].handoff_state).toBe("claimed");
    expect(rows[0].handoff_state).toBe("sent");
    // ONE row, not two. A mutation check caught this missing: adding the
    // old insert-after-success back alongside the claim doubled every
    // Gmail send in email_sends and nothing noticed, because this test
    // only looked at rows[0].
    expect(rows).toHaveLength(1);
  });

  it("a blank key is treated as no key, not as a key", async () => {
    // An empty string from a client that meant to send nothing must not
    // become a claim that collides with the next empty string.
    await send("   ");
    expect(rows[0].idempotency_key).toBeUndefined();
    expect(rows[0].handoff_state).toBeUndefined();
  });
});

describe("without a request id, nothing changes", () => {
  it("THE OLD INSERT-AFTER-SUCCESS PATH IS UNTOUCHED", async () => {
    // The approvals executor and chat's own send have no concept of a
    // press. Breaking them to fix the double-click would be a bad trade.
    const r = await send();
    expect(r.success).toBe(true);
    // Nothing existed when the sender ran.
    expect(rowsWhenSent[0]).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].handoff_state).toBeUndefined();
    expect(rows[0].resend_message_id).toBe("msg-7");
  });

  it("and a FAILED send still writes no row at all", async () => {
    resendOk = false;
    const r = await send();
    expect(r.success).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("the gmail path also still logs only on success", async () => {
    gmailConnected = true;
    await send();
    expect(rows).toHaveLength(1);
    expect(rows[0].via).toBe("gmail");

    rows.length = 0;
    gmailOk = false;
    await send();
    expect(rows).toHaveLength(0);
  });
});

describe("the key actually reaches the endpoint", () => {
  // A mechanism no caller feeds is inert. These are the two senders
  // where a double-press is physically possible — a card in chat and a
  // button on a lead — and both must mint ONE id per composed email, not
  // one per press.
  it("THE CHAT CARD CARRIES A REQUEST ID, minted when the card is built", async () => {
    const { emailSendAction } = await import("@/lib/chat/publishActions");
    const card = emailSendAction({ to: "asha@example.com", businessName: "Test Business", payload: { subject: "s", body: "b" } });
    expect(card.endpoint).toBe("/api/email/send");
    expect(String((card.payload as any).request_id)).toMatch(/^chat-/);
  });

  it("and two separate cards get two different ids", async () => {
    // A deliberate second email must not be refused as a duplicate of
    // the first.
    const { emailSendAction } = await import("@/lib/chat/publishActions");
    const a = emailSendAction({ to: "asha@example.com", businessName: "B", payload: {} });
    const b = emailSendAction({ to: "asha@example.com", businessName: "B", payload: {} });
    expect((a.payload as any).request_id).not.toBe((b.payload as any).request_id);
  });

  it("A CALLER'S OWN request_id IS NOT OVERRIDDEN BY THE DEFAULT", async () => {
    // The spread sits AFTER request_id on purpose, so a caller that has
    // its own id keeps it. If that order flips, every caller silently
    // gets a fresh id per card and the mechanism stops meaning anything.
    const { emailSendAction } = await import("@/lib/chat/publishActions");
    const card = emailSendAction({ to: "a@b.com", businessName: "B", payload: { request_id: "mine-1" } });
    expect((card.payload as any).request_id).toBe("mine-1");
  });

  it("the lead button sends one id per composed message, not per press", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/components/leads/GenerateMessageButton.tsx", "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    // Reused across presses...
    expect(code).toMatch(/if \(!requestIdRef\.current\) requestIdRef\.current =/);
    expect(code).toMatch(/request_id: requestIdRef\.current/);
    // ...and cleared when the draft it belongs to is thrown away.
    expect(code).toMatch(/requestIdRef\.current = null/);
  });

  it("EVERY sendMarketingEmail CALL IN THE ROUTE PASSES IT, not just one", async () => {
    // Counted, not pattern-matched. A `toMatch` here survived two
    // mutations: the route has two call sites - a visual draft and plain
    // words - and the regex was satisfied by either one, so dropping the
    // id from one path broke nothing. The path that still worked was
    // hiding the path that did not.
    //
    // tests/emailSendRequestId.test.ts runs the route for real; this is
    // the cheap guard that no THIRD call site appears without the id.
    const { readFileSync } = await import("fs");
    const code = readFileSync("src/app/api/email/send/route.ts", "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).toMatch(/request_id\.trim\(\)/);
    const calls = (code.match(/sendMarketingEmail\(/g) ?? []).length;
    const withId = (code.match(/sendMarketingEmail\([^;]*requestId\)/g) ?? []).length;
    expect(calls).toBeGreaterThan(0);
    expect(withId).toBe(calls);
  });
});
