// A claim is not a send, and the numbers have to know that.
//
// WHY THIS FILE EXISTS AT ALL: /api/email/stats had no test of any kind.
// Migration 208 made email_sends hold rows for emails that are still in
// flight ('claimed') and for ones that never left ('failed'), and this
// route counts rows as sends — so without a filter it would have
// overstated send volume and quietly deflated every open and click rate
// computed from it. A mutation check removed the filter and nothing
// failed, which is how the gap was found.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
let sends: Row[];
let signedIn: Row | null;

function db() {
  return {
    auth: { getUser: async () => ({ data: { user: signedIn } }) },
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { dealership_id: "d1" } }) }) }) };
      }
      const api: any = {
        select: () => api,
        eq: () => api,
        gte: async () => ({ data: sends, error: null }),
      };
      return api;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { GET } from "@/app/api/email/stats/route";

const row = (over: Row = {}): Row => ({ via: "resend", opened: false, clicked: false, created_at: new Date().toISOString(), ...over });

beforeEach(() => {
  sends = [];
  signedIn = { id: "u1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const stats = async () => (await (await GET()).json()) as any;

describe("what counts as a send", () => {
  it("A CLAIMED ROW IS NOT COUNTED — the email is still in flight", async () => {
    sends = [row({ handoff_state: "sent" }), row({ handoff_state: "claimed" })];
    const s = await stats();
    expect(s.totalSent).toBe(1);
  });

  it("A FAILED ROW IS NOT COUNTED — the email never left", async () => {
    sends = [row({ handoff_state: "sent" }), row({ handoff_state: "failed" })];
    expect((await stats()).totalSent).toBe(1);
  });

  it("NULL IS COUNTED, and that is not an oversight", async () => {
    // Any caller with no idempotency key still takes the old
    // insert-after-success path, so null keeps appearing — and those
    // rows ARE successful sends. The backfill did not make null
    // impossible.
    sends = [row({ handoff_state: null }), row({})];
    expect((await stats()).totalSent).toBe(2);
  });

  it("the open and click rates are computed over SENT rows only", async () => {
    // This is the damage a missing filter actually does: the rate's
    // denominator grows with emails that were never delivered, so a
    // perfectly healthy list reads as a failing one.
    sends = [
      row({ handoff_state: "sent", opened: true, clicked: true }),
      row({ handoff_state: "claimed" }),
      row({ handoff_state: "failed" }),
    ];
    const s = await stats();
    expect(s.resendSentCount).toBe(1);
    expect(s.openRate).toBe(100);
    expect(s.clickRate).toBe(100);
  });

  it("gmail and resend are still counted separately", async () => {
    // Gmail sends cannot be enriched with opens or clicks — Gmail gives
    // Hawlai no webhook — so the split has to survive the new filter.
    sends = [row({ via: "gmail", handoff_state: "sent" }), row({ via: "resend", handoff_state: "sent" })];
    const s = await stats();
    expect(s.gmailSentCount).toBe(1);
    expect(s.resendSentCount).toBe(1);
  });

  it("no sends at all gives null rates, not zero", async () => {
    // A rate of 0% says "nobody opened it". Null says "there is nothing
    // to measure", which is the true statement.
    sends = [];
    const s = await stats();
    expect(s.totalSent).toBe(0);
    expect(s.openRate).toBeNull();
    expect(s.clickRate).toBeNull();
  });

  it("only claimed and failed rows gives nothing, not a false total", async () => {
    sends = [row({ handoff_state: "claimed" }), row({ handoff_state: "failed" })];
    const s = await stats();
    expect(s.totalSent).toBe(0);
    expect(s.openRate).toBeNull();
  });
});

describe("who may read it", () => {
  it("a signed-out request is refused", async () => {
    signedIn = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
