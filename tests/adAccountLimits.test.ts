// The account's real spending limits, so nobody looks them up on Meta.
//
// THE INCIDENT: a merchant was sent to Meta's site to read
// min_daily_budget by hand. The numbers in circulation for INR were
// ₹40, ₹87.90 and ₹100; the account's actual value is ₹94.91. The most
// commonly cited figure is BELOW the floor, so a campaign set to it is
// rejected by Meta with an error naming neither the limit nor the fix.
// Hardcoding any of them would have been worse than not knowing.
//
// 9491 paise is used throughout as the fixture because it is the real
// observed value, not a round number that would hide an off-by-100.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isAccountUsable,
  formatMinorAmount,
  describeMinimum,
  isStale,
  clampBudgetToMinimum,
  fetchAdAccountLimits,
  getAdAccountLimits,
  limitsFromRow,
  limitsToRow,
  LIMITS_TTL_MS,
} from "@/lib/ads/adAccountLimits";

const REAL_MIN = 9491; // paise — act_1568276064894949, observed
const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);

afterEach(() => vi.unstubAllGlobals());

describe("minor units become an amount a person can read", () => {
  it("renders the real observed minimum", () => {
    expect(formatMinorAmount(REAL_MIN, "INR")).toContain("94.91");
    expect(describeMinimum({ minDailyBudget: REAL_MIN, currency: "INR", accountStatus: 1, checkedAt: null })).toMatch(/94\.91\/day/);
  });

  it("does not divide by 100 for a zero-decimal currency", () => {
    // JPY has no minor unit. Dividing by 100 would report a ¥9,491
    // minimum as ¥94.91 — a hundredfold understatement on the one
    // number a merchant is using to decide what to spend.
    expect(formatMinorAmount(9491, "JPY")).toContain("9,491");
  });

  it("handles USD like INR — two decimals", () => {
    expect(formatMinorAmount(100, "USD")).toContain("1.00");
  });

  it("returns null rather than a bare number when there is nothing to show", () => {
    expect(formatMinorAmount(null, "INR")).toBeNull();
    expect(formatMinorAmount(undefined, "INR")).toBeNull();
    expect(describeMinimum({ minDailyBudget: null, currency: "INR", accountStatus: 1, checkedAt: null })).toBeNull();
  });

  it("still formats when the currency is unknown, without inventing a symbol", () => {
    // The rupee-on-a-USD-store bug, in a new place.
    const out = formatMinorAmount(9491, null);
    expect(out).toBe("94.91");
  });
});

describe("account status is translated into something actionable", () => {
  it("treats the observed ACTIVE account as usable", () => {
    expect(isAccountUsable(1).usable).toBe(true);
  });

  it("allows a grace period to keep running", () => {
    // status 9 still delivers ads. Blocking it would stop a working
    // campaign over a payment method that has not actually failed yet.
    const r = isAccountUsable(9);
    expect(r.usable).toBe(true);
    expect(r.reason).toMatch(/grace period/i);
  });

  it.each([[2, /disabled/i], [3, /unsettled|balance/i], [7, /review/i], [101, /closed/i]])(
    "blocks status %i and says why in plain words",
    (status, expected) => {
      const r = isAccountUsable(status);
      expect(r.usable).toBe(false);
      expect(r.reason).toMatch(expected);
      // The point of the whole exercise: never make someone decode a
      // status code on Meta's site.
      expect(r.reason).not.toMatch(/account_status|status \d/);
    }
  );

  it("blocks an UNKNOWN status rather than assuming it can spend", () => {
    const r = isAccountUsable(202);
    expect(r.usable).toBe(false);
    expect(r.reason.length).toBeGreaterThan(20);
  });

  it("treats NEVER CHECKED as usable, not as broken", () => {
    // null means we have not asked. Refusing to launch because the
    // cache is empty would turn a missing row into a broken product —
    // exactly the wrong direction for a feature meant to remove
    // friction.
    expect(isAccountUsable(null).usable).toBe(true);
    expect(isAccountUsable(undefined).usable).toBe(true);
  });
});

describe("the budget is raised to the floor, never lowered", () => {
  it("raises the AI plan's default past the real minimum when it is under", () => {
    const r = clampBudgetToMinimum(5000, REAL_MIN);
    expect(r.minor).toBe(REAL_MIN);
    expect(r.raised).toBe(true);
    expect(r.from).toBe(5000);
  });

  it("leaves the plan's ₹500/day default alone — it is well above the floor", () => {
    const r = clampBudgetToMinimum(50000, REAL_MIN);
    expect(r.minor).toBe(50000);
    expect(r.raised).toBe(false);
  });

  it("NEVER lowers a budget", () => {
    // A silent reduction would underspend a campaign the merchant
    // believes is running at their number. Raising is visible on the
    // preview and in the response; lowering would not be.
    for (const requested of [50000, 100000, 9492]) {
      expect(clampBudgetToMinimum(requested, REAL_MIN).minor).toBeGreaterThanOrEqual(requested);
    }
  });

  it("accepts exactly the minimum without flagging a raise", () => {
    const r = clampBudgetToMinimum(REAL_MIN, REAL_MIN);
    expect(r.minor).toBe(REAL_MIN);
    expect(r.raised).toBe(false);
  });

  it("passes the request through untouched when the minimum is unknown", () => {
    // Not knowing must not become a reason to change what the merchant
    // asked for. Meta enforces its own floor regardless.
    for (const unknown of [null, undefined, 0, NaN]) {
      const r = clampBudgetToMinimum(5000, unknown as any);
      expect(r.minor).toBe(5000);
      expect(r.raised).toBe(false);
    }
  });
});

describe("staleness", () => {
  it("treats a never-checked reading as stale", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale(undefined, NOW)).toBe(true);
  });

  it("treats an unparseable timestamp as stale rather than fresh", () => {
    expect(isStale("not a date", NOW)).toBe(true);
  });

  it("keeps a recent reading", () => {
    expect(isStale(new Date(NOW - 60_000).toISOString(), NOW)).toBe(false);
  });

  it("expires one past the TTL", () => {
    expect(isStale(new Date(NOW - LIMITS_TTL_MS - 1000).toISOString(), NOW)).toBe(true);
  });
});

describe("row mapping round-trips", () => {
  it("survives a trip through the column names", () => {
    const limits = { minDailyBudget: REAL_MIN, currency: "INR", accountStatus: 1, checkedAt: new Date(NOW).toISOString() };
    expect(limitsFromRow(limitsToRow(limits))).toEqual(limits);
  });

  it("reads an empty row as all-unknown rather than throwing", () => {
    expect(limitsFromRow(null)).toEqual({ minDailyBudget: null, currency: null, accountStatus: null, checkedAt: null });
  });
});

describe("fetching from Meta", () => {
  const ok = (body: any) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }));

  it("asks for the three fields on the ad account, with act_ prefixed", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ min_daily_budget: REAL_MIN, currency: "INR", account_status: 1 }) });
    vi.stubGlobal("fetch", spy);

    await fetchAdAccountLimits("1568276064894949", "TOKEN");
    const url = spy.mock.calls[0][0];
    expect(url).toContain("/act_1568276064894949?");
    expect(url).toContain("min_daily_budget");
    expect(url).toContain("account_status");
  });

  it("does not double-prefix an id that already has act_", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", spy);
    await fetchAdAccountLimits("act_123", "TOKEN");
    expect(spy.mock.calls[0][0]).not.toContain("act_act_");
  });

  it("returns the parsed limits", async () => {
    ok({ min_daily_budget: REAL_MIN, currency: "INR", account_status: 1 });
    const r = await fetchAdAccountLimits("act_1", "TOKEN");
    expect(r.ok && r.limits.minDailyBudget).toBe(REAL_MIN);
    expect(r.ok && r.limits.currency).toBe("INR");
    expect(r.ok && r.limits.accountStatus).toBe(1);
  });

  it("reports a Graph error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "Unsupported get request." } }) }));
    const r = await fetchAdAccountLimits("act_1", "TOKEN");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Unsupported/);
  });

  it("survives the network being down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const r = await fetchAdAccountLimits("act_1", "TOKEN");
    expect(r.ok).toBe(false);
  });
});

describe("getAdAccountLimits — cache, refresh, and never blocking a launch", () => {
  function db(row: any) {
    const updates: any[] = [];
    return {
      updates,
      client: {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
          update: (fields: any) => { updates.push(fields); return { eq: async () => ({ data: null }) }; },
        }),
      },
    };
  }

  const fresh = { fb_ad_account_id: "act_1", fb_min_daily_budget: REAL_MIN, fb_currency: "INR", fb_account_status: 1, fb_limits_checked_at: new Date(NOW - 1000).toISOString() };

  it("uses the cache and does NOT call Meta when the reading is fresh", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const d = db(fresh);

    const limits = await getAdAccountLimits(d.client, "d1", { row: fresh, token: "TOKEN", now: NOW });
    expect(limits.minDailyBudget).toBe(REAL_MIN);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refreshes and persists when the reading is stale", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ min_daily_budget: 10000, currency: "INR", account_status: 1 }) }));
    const stale = { ...fresh, fb_limits_checked_at: new Date(NOW - LIMITS_TTL_MS - 1).toISOString() };
    const d = db(stale);

    const limits = await getAdAccountLimits(d.client, "d1", { row: stale, token: "TOKEN", now: NOW });
    expect(limits.minDailyBudget).toBe(10000);
    expect(d.updates[0].fb_min_daily_budget).toBe(10000);
  });

  it("RETURNS THE CACHE when Meta cannot be reached", async () => {
    // The load-bearing one. This runs inside an ad preview; being
    // unable to reach Meta for a validation call must not stop a
    // merchant previewing an ad. Meta enforces its own floor anyway —
    // this only exists to say so first.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const stale = { ...fresh, fb_limits_checked_at: new Date(NOW - LIMITS_TTL_MS - 1).toISOString() };
    const d = db(stale);

    const limits = await getAdAccountLimits(d.client, "d1", { row: stale, token: "TOKEN", now: NOW });
    expect(limits.minDailyBudget).toBe(REAL_MIN);
    expect(d.updates).toEqual([]);
  });

  it("does not call Meta without a token", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await getAdAccountLimits(db(fresh).client, "d1", { row: { ...fresh, fb_limits_checked_at: null }, token: null, now: NOW });
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call Meta when no ad account is connected", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const limits = await getAdAccountLimits(db(null).client, "d1", { row: { fb_ad_account_id: null }, token: "TOKEN", now: NOW });
    expect(spy).not.toHaveBeenCalled();
    expect(limits.minDailyBudget).toBeNull();
  });
});
