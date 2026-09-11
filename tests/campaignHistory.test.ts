// Campaign Performance History: running totals, date ranges, the slider.
//
// WHY: every daily snapshot stores a campaign's LIFETIME figures
// (Meta's date_preset=maximum; all-time leads and revenue). The page
// summed them, so each recorded day added the whole lifetime again.
// Ranges must be differences between snapshots — and that is also what
// makes the date-range slider's numbers right.

import { describe, it, expect } from "vitest";
import {
  toHistoryRow, historyDates, rangeTotals, dailySeries, addDays, fetchAllHistory, HISTORY_PAGE_SIZE, type HistoryRow,
} from "@/lib/analytics/campaignHistory";
import { clampRange, rangeLabel, thumbCentre } from "@/lib/analytics/dateRangeSlider";

const snap = (id: string, date: string, v: Partial<HistoryRow>): HistoryRow => ({
  ad_creative_id: id, snapshot_date: date, headline: id,
  spend: 0, impressions: 0, clicks: 0, leads: 0, revenue: 0, conversions: 0, delivery_status: null, ...v,
});

describe("snapshots are running totals — never summed", () => {
  // Two days of the lavender campaign: ₹100 by day one, ₹150 by day two.
  const rows = [snap("lav", "2026-09-10", { spend: 100, leads: 2 }), snap("lav", "2026-09-11", { spend: 150, leads: 3 })];

  it("all-time spend is the latest running total (150), not the sum of snapshots (250)", () => {
    const [c] = rangeTotals(rows, "2026-09-10", "2026-09-11");
    expect(c.totals.spend).toBe(150);
    expect(c.totals.leads).toBe(3);
  });

  it("a single day is that day's change", () => {
    expect(rangeTotals(rows, "2026-09-11", "2026-09-11")[0].totals.spend).toBe(50);
    expect(rangeTotals(rows, "2026-09-10", "2026-09-10")[0].totals.spend).toBe(100);
  });

  it("the chart plots daily spend, which adds up to the range total", () => {
    const series = dailySeries(rows, "2026-09-10", "2026-09-11");
    expect(series.map((p) => p.spend)).toEqual([100, 50]);
    expect(series.reduce((a, p) => a + p.spend, 0)).toBe(rangeTotals(rows, "2026-09-10", "2026-09-11")[0].totals.spend);
  });
});

describe("a day Meta couldn't be read is skipped, never zero", () => {
  const rows = [
    snap("lav", "2026-09-10", { spend: 100 }),
    snap("lav", "2026-09-11", { spend: null }), // insights unreadable that day
    snap("lav", "2026-09-12", { spend: 180 }),
  ];

  it("totals are unaffected", () => {
    expect(rangeTotals(rows, "2026-09-10", "2026-09-12")[0].totals.spend).toBe(180);
    expect(rangeTotals(rows, "2026-09-11", "2026-09-12")[0].totals.spend).toBe(80);
  });

  it("the chart shows nothing on the unreadable day and the real change after it — no dip, no spike", () => {
    expect(dailySeries(rows, "2026-09-10", "2026-09-12").map((p) => p.spend)).toEqual([100, 0, 80]);
  });
});

describe("ranges and campaigns", () => {
  const rows = [
    snap("a", "2026-09-01", { spend: 10, impressions: 1000, clicks: 20 }),
    snap("a", "2026-09-05", { spend: 50, impressions: 5000, clicks: 100 }), // gap: days 2-4 not recorded
    snap("b", "2026-09-04", { spend: 30, impressions: 2000, clicks: 10 }),
  ];

  it("a missing day doesn't lose spend: it lands on the next recorded day", () => {
    expect(rangeTotals(rows, "2026-09-02", "2026-09-05").find((c) => c.id === "a")!.totals.spend).toBe(40);
  });

  it("a campaign with no recorded day in the range is left out", () => {
    expect(rangeTotals(rows, "2026-09-01", "2026-09-02").map((c) => c.id)).toEqual(["a"]);
  });

  it("impressions and clicks are range differences, so CPC and CTR match the dates selected", () => {
    const a = rangeTotals(rows, "2026-09-02", "2026-09-05").find((c) => c.id === "a")!;
    expect(a.totals.impressions).toBe(4000);
    expect(a.totals.clicks).toBe(80);
    // CPC = 40 / 80 = ₹0.50, CTR = 80 / 4000 = 2%
    expect(a.totals.spend / a.totals.clicks).toBe(0.5);
    expect((a.totals.clicks / a.totals.impressions) * 100).toBe(2);
  });

  it("a running total that shrinks (a lead deleted) shows nothing, never a negative", () => {
    const shrink = [snap("a", "2026-09-01", { leads: 5 }), snap("a", "2026-09-02", { leads: 4 })];
    expect(rangeTotals(shrink, "2026-09-02", "2026-09-02")[0].totals.leads).toBe(0);
    expect(dailySeries(shrink, "2026-09-02", "2026-09-02")[0].leads).toBe(0);
  });

  it("the daily series sums across campaigns", () => {
    const s = dailySeries(rows, "2026-09-04", "2026-09-05");
    expect(s).toEqual([
      { date: "2026-09-04", spend: 30, leads: 0, revenue: 0 },
      { date: "2026-09-05", spend: 40, leads: 0, revenue: 0 },
    ]);
  });

  it("keeps the latest definitive recorded status, skipping a day whose check failed", () => {
    const withStatus = [
      snap("a", "2026-09-01", { delivery_status: "active" }),
      snap("a", "2026-09-02", { delivery_status: "paused" }),
      snap("a", "2026-09-03", { delivery_status: "unknown" }),
    ];
    expect(rangeTotals(withStatus, "2026-09-01", "2026-09-03")[0].recorded).toEqual({ state: "paused", date: "2026-09-02" });
  });
});

describe("the slider's bounds come from the data and scale", () => {
  it("spans the first to the last recorded day, every calendar day included, across month ends", () => {
    const rows = [snap("a", "2026-09-29", {}), snap("a", "2026-10-02", {})];
    expect(historyDates(rows)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("works with today's real shape — one or two days", () => {
    expect(historyDates([snap("a", "2026-09-10", {})])).toEqual(["2026-09-10"]);
    expect(historyDates([])).toEqual([]);
  });

  it("scales: a year of daily history for five campaigns stays exact", () => {
    const rows: HistoryRow[] = [];
    for (const id of ["a", "b", "c", "d", "e"]) {
      for (let day = 0; day < 400; day++) rows.push(snap(id, addDays("2025-08-07", day), { spend: (day + 1) * 10 }));
    }
    const dates = historyDates(rows);
    expect(dates).toHaveLength(400);
    const all = rangeTotals(rows, dates[0], dates[399]);
    expect(all).toHaveLength(5);
    expect(all.every((c) => c.totals.spend === 4000)).toBe(true);
    // Any window: its total equals the sum of its daily points.
    const [from, to] = [dates[100], dates[250]];
    const windowTotal = rangeTotals(rows, from, to).reduce((a, c) => a + c.totals.spend, 0);
    const seriesTotal = dailySeries(rows, from, to).reduce((a, p) => a + p.spend, 0);
    expect(windowTotal).toBe(seriesTotal);
    expect(windowTotal).toBe(5 * 151 * 10);
  });
});

describe("slider behaviour", () => {
  it("handles never cross — the moved one stops at the other", () => {
    expect(clampRange(8, 5, 10, "start")).toEqual([5, 5]);
    expect(clampRange(3, 1, 10, "end")).toEqual([3, 3]);
  });

  it("handles stay within the history", () => {
    expect(clampRange(-4, 99, 10, "end")).toEqual([0, 9]);
    expect(clampRange(0, 0, 1, "end")).toEqual([0, 0]);
  });

  it("label reads 'D Mon – D Mon', or one date when both handles meet", () => {
    const dates = ["2026-09-09", "2026-09-10", "2026-09-11"];
    expect(rangeLabel(dates, 0, 2)).toBe("9 Sep – 11 Sep");
    expect(rangeLabel(dates, 1, 1)).toBe("10 Sep");
    expect(rangeLabel([], 0, 0)).toBe("");
  });

  it("the filled segment lines up with the thumb centres at both ends", () => {
    expect(thumbCentre(0, 10, 16)).toBe("calc(0% + 8.00px)");
    expect(thumbCentre(9, 10, 16)).toBe("calc(100% + -8.00px)");
  });
});

describe("the whole history is fetched, past Supabase's 1,000-row cap", () => {
  function pagedDb(total: number) {
    const all = Array.from({ length: total }, (_, i) => ({ ad_creative_id: `c${i % 7}`, snapshot_date: addDays("2025-01-01", Math.floor(i / 7)), spend: i }));
    const ranges: [number, number][] = [];
    return {
      ranges,
      client: {
        from: () => {
          const api: any = {
            select: () => api, eq: () => api, order: () => api,
            range: async (a: number, b: number) => { ranges.push([a, b]); return { data: all.slice(a, b + 1), error: null }; },
          };
          return api;
        },
      },
    };
  }

  it("2,500 rows → all 2,500, in three pages", async () => {
    const db = pagedDb(2500);
    const r = await fetchAllHistory(db.client, "d1");
    expect(r.data).toHaveLength(2500);
    expect(db.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(r.truncated).toBe(false);
  });

  it("exactly one full page → asks once more, finds nothing, stops", async () => {
    const db = pagedDb(HISTORY_PAGE_SIZE);
    const r = await fetchAllHistory(db.client, "d1");
    expect(r.data).toHaveLength(HISTORY_PAGE_SIZE);
    expect(db.ranges).toHaveLength(2);
  });

  it("a database error is reported, not turned into an empty history", async () => {
    const client = { from: () => { const api: any = { select: () => api, eq: () => api, order: () => api, range: async () => ({ data: null, error: { message: "boom" } }) }; return api; } };
    const r = await fetchAllHistory(client, "d1");
    expect(r.data).toBeNull();
    expect(r.error?.message).toBe("boom");
  });

  it("normalises database values — numeric strings become numbers, missing stays null", () => {
    expect(toHistoryRow({ ad_creative_id: "a", snapshot_date: "2026-09-10T00:00:00", spend: "100.50", impressions: null })).toMatchObject({ snapshot_date: "2026-09-10", spend: 100.5, impressions: null });
  });
});
