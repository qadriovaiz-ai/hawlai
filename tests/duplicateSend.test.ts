// The same email, sent twice, because a button was pressed twice.
//
// /api/email/send had no idempotency of any kind: a retried request, a
// double-click, or an approval card re-pressed after a slow response
// sent the email again, and nothing in the product would have noticed.
//
// These tests also pin what the mechanism does NOT guarantee, because
// the honest description matters more than the reassuring one: it is a
// duplicate-suppression WINDOW over `email_sends`, not an idempotency
// key, and it is not atomic.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { recentDuplicateSend, DUPLICATE_WINDOW_MINUTES } from "@/lib/email/duplicateSend";
import { code } from "./helpers/source";

type Row = Record<string, any>;
let rows: Row[];
let readError: string | null;
let queried: [string, any][];

function db() {
  const from = (_table: string) => {
    const filters: [string, any][] = [];
    let since: string | null = null;
    let take: number | null = null;
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), queried.push([k, v]), api),
      gte: (_k: string, v: string) => ((since = v), api),
      order: () => api,
      // THE LIMIT IS HONOURED, not swallowed. It was a no-op here, and a
      // mutation check proved what that cost: narrowing the query back
      // to .limit(1) broke nothing, because the mock returned every
      // matching row regardless. A harness that ignores the thing under
      // test cannot test it.
      limit: (n: number) => ((take = n), api),
      then: (res: any, rej: any) => {
        if (readError) return Promise.resolve({ data: null, error: { message: readError } }).then(res, rej);
        const matched = rows
          .filter((r) => filters.every(([k, v]) => r[k] === v) && (!since || r.created_at >= since))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, take ?? undefined);
        return Promise.resolve({ data: matched, error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from };
}

const NOW = new Date("2026-10-09T12:00:00.000Z").getTime();
const now = () => NOW;
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

beforeEach(() => {
  rows = [];
  readError = null;
  queried = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the same email twice", () => {
  it("A SECOND IDENTICAL SEND INSIDE THE WINDOW IS REFUSED", async () => {
    rows = [{ dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1) }];
    const result = await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now);
    expect(result.duplicate).toBe(true);
    expect((result as any).error).toMatch(/already went to asha@example.com/);
    // It says how to proceed deliberately — a refusal with no way
    // forward reads as a bug.
    expect((result as any).error).toMatch(/change the subject or wait/);
  });

  it("the same send OUTSIDE the window goes through", async () => {
    rows = [{ dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(DUPLICATE_WINDOW_MINUTES + 1) }];
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now)).duplicate).toBe(false);
  });

  it("A DIFFERENT RECIPIENT OR SUBJECT IS NOT A DUPLICATE", async () => {
    rows = [{ dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1) }];
    expect((await recentDuplicateSend(db(), "d1", "ravi@example.com", "Diwali offer", now)).duplicate).toBe(false);
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "New stock", now)).duplicate).toBe(false);
  });

  it("ANOTHER BUSINESS'S SEND IS NOT THIS BUSINESS'S DUPLICATE", async () => {
    rows = [{ dealership_id: "d2", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1) }];
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now)).duplicate).toBe(false);
    // And the query is scoped, not filtered after the fact.
    expect(queried).toEqual(expect.arrayContaining([["dealership_id", "d1"]]));
  });

  it("FAILS OPEN on a read error, and says so in the log", async () => {
    // A database hiccup must not block an email the owner already
    // approved. The rare double costs less than a silent refusal.
    readError = "connection reset";
    rows = [{ dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1) }];
    const result = await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now);
    expect(result.duplicate).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("a thrown client also fails open", async () => {
    const broken = { from: () => { throw new Error("no connection"); } };
    expect((await recentDuplicateSend(broken, "d1", "a@b.com", "x", now)).duplicate).toBe(false);
  });

  it("nothing on record is not a duplicate", async () => {
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now)).duplicate).toBe(false);
  });

  it("A FAILED SEND DOES NOT SUPPRESS THE RETRY OF ITSELF", async () => {
    // Migration 208 made this table hold rows for sends that FAILED.
    // Without this, one failure would block the retry for five minutes —
    // the opposite of what the owner needs. Found by a mutation check:
    // reverting the filter here broke nothing, because this file had no
    // case for it.
    rows = [{ dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1), handoff_state: "failed" }];
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now)).duplicate).toBe(false);
  });

  it("A SEND STILL IN FLIGHT ('claimed') DOES suppress a second press", async () => {
    // This is the concurrent double-click the window is actually for:
    // the first request has claimed but not finished, and the second
    // must not send.
    rows = [{ dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1), handoff_state: "claimed" }];
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now)).duplicate).toBe(true);
  });

  it("a failed row does not hide an earlier REAL send behind it", async () => {
    // Why the query takes a few rows rather than the newest one: if the
    // most recent attempt failed, the genuine send underneath it still
    // has to be found.
    rows = [
      { dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1), handoff_state: "failed" },
      { dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(2), handoff_state: "sent" },
    ];
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now)).duplicate).toBe(true);
  });

  it("rows written before migration 208 still count, null state and all", async () => {
    // `handoff_state <> 'failed'` would be NULL for these and drop every
    // historical send out of the window, which is why the filter is in
    // JS and not in the query.
    rows = [{ dealership_id: "d1", to_email: "asha@example.com", subject: "Diwali offer", created_at: minutesAgo(1) }];
    expect((await recentDuplicateSend(db(), "d1", "asha@example.com", "Diwali offer", now)).duplicate).toBe(true);
  });

  it("THE WINDOW IS SHORT ON PURPOSE", () => {
    // It cannot tell a double-submit from a deliberate second send of
    // the same subject, so the window has to be measured in minutes. A
    // window of hours would start refusing legitimate sends.
    expect(DUPLICATE_WINDOW_MINUTES).toBeLessThanOrEqual(15);
    expect(DUPLICATE_WINDOW_MINUTES).toBeGreaterThan(0);
  });
});

describe("the send endpoint consults it", () => {
  it("THE CHECK IS WIRED, and runs before the send", () => {
    // Moved on 2026-10-10: the route's work was extracted to
    // src/lib/email/sendApprovedEmail.ts so the approvals route can send
    // without calling this app over HTTP (G-3 step 3). The check moved
    // WITH it; this test follows it rather than being deleted.
    const src = code("src/lib/email/sendApprovedEmail.ts");
    expect(src).toMatch(/recentDuplicateSend\(/);
    expect(src).toMatch(/status: 409/);
    // Before the sender, or it costs nothing to check.
    expect(src.indexOf("recentDuplicateSend(")).toBeLessThan(src.indexOf("sendMarketingEmail("));
    // And the route must NOT have kept a copy, or the approvals path
    // would be the only caller missing it.
    expect(code("src/app/api/email/send/route.ts")).not.toMatch(/recentDuplicateSend/);
  });
});
