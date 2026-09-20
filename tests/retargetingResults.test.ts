// Retargeting R5 (2026-09-20): what each audience actually brought back.
//
// An ad records which audience and tier it was for; Meta returns the
// campaign id; orders and enquiries already carry the campaign they came
// from. So the orders and bookings that arrived through a retargeting ad
// are counted back to that exact group — from the business's own records,
// never Meta's estimate.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const api: any = {
    select: () => api, order: () => api, limit: () => api, or: () => api, gte: () => api, lt: () => api, neq: () => api,
    eq: (c: string, v: any) => (filters.push((r) => !(c in r) || r[c] === v), api),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), api),
    not: (c: string, op: string, v: any) => (filters.push((r) => (op === "is" && v === null ? r[c] != null : true)), api),
    is: () => api,
    single: async () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(res, rej),
  };
  return api;
}
const client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: (t: string) => query(t) });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));

import { resultsByAudience, resultsLine, EMPTY_RESULTS } from "@/lib/retargeting/results";
import { GET as dashboard } from "@/app/api/retargeting/dashboard/route";

const ad = (key: string, campaign: string | null, over: Row = {}) => ({ dealership_id: "d1", retarget_audience_key: key, meta_campaign_id: campaign, created_at: "2026-09-01T00:00:00Z", ...over });

beforeEach(() => {
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", business_models: ["products"] }],
    products: [],
    ad_creatives: [],
    orders: [],
    leads: [],
    appointments: [],
    abandoned_carts: [],
    page_events: [],
    meta_custom_audiences: [],
  };
});
afterEach(() => vi.restoreAllMocks());

describe("what an audience brought back", () => {
  it("orders and revenue from that group's own campaigns — cancelled ones don't count", async () => {
    tables.ad_creatives = [ad("abandoned_cart:1_3", "c1"), ad("abandoned_cart:15_30", "c2")];
    tables.orders = [
      { dealership_id: "d1", meta_campaign_id: "c1", total: 1200, status: "paid" },
      { dealership_id: "d1", meta_campaign_id: "c1", total: 800, status: "delivered" },
      { dealership_id: "d1", meta_campaign_id: "c1", total: 500, status: "cancelled" },
      { dealership_id: "d1", meta_campaign_id: "c2", total: 900, status: "paid" },
      // Not from a retargeting campaign at all.
      { dealership_id: "d1", meta_campaign_id: "c9", total: 5000, status: "paid" },
    ];
    const r = await resultsByAudience(client(), "d1");
    expect(r["abandoned_cart:1_3"]).toMatchObject({ campaigns: 1, orders: 2, revenueInr: 2000 });
    expect(r["abandoned_cart:15_30"]).toMatchObject({ campaigns: 1, orders: 1, revenueInr: 900 });
  });

  it("each tier's results are its own, and another business's orders never count", async () => {
    tables.ad_creatives = [ad("abandoned_cart:1_3", "c1"), ad("abandoned_cart:1_3", "c3"), { ...ad("abandoned_cart:4_14", "c4"), dealership_id: "d2" }];
    tables.orders = [
      { dealership_id: "d1", meta_campaign_id: "c1", total: 100, status: "paid" },
      { dealership_id: "d1", meta_campaign_id: "c3", total: 200, status: "paid" },
      { dealership_id: "d2", meta_campaign_id: "c1", total: 999, status: "paid" },
    ];
    const r = await resultsByAudience(client(), "d1");
    expect(r["abandoned_cart:1_3"]).toMatchObject({ campaigns: 2, orders: 2, revenueInr: 300 });
    expect(r["abandoned_cart:4_14"]).toBeUndefined();
  });

  it("enquiries, and the bookings those enquirers made — a cancelled booking isn't one", async () => {
    tables.ad_creatives = [ad("booking_visitors:4_14", "c1")];
    tables.leads = [
      { id: "l1", dealership_id: "d1", meta_campaign_id: "c1" },
      { id: "l2", dealership_id: "d1", meta_campaign_id: "c1" },
      { id: "l3", dealership_id: "d1", meta_campaign_id: "other" },
    ];
    tables.appointments = [
      { dealership_id: "d1", lead_id: "l1", status: "scheduled" },
      { dealership_id: "d1", lead_id: "l2", status: "cancelled" },
      { dealership_id: "d1", lead_id: "l3", status: "scheduled" },
    ];
    expect(await resultsByAudience(client(), "d1")).toEqual({
      "booking_visitors:4_14": { campaigns: 1, orders: 0, revenueInr: 0, leads: 2, bookings: 1, since: "2026-09-01T00:00:00Z" },
    });
  });

  it("an ad Meta never gave a campaign id for is counted for nothing", async () => {
    tables.ad_creatives = [ad("abandoned_cart:1_3", null), ad("abandoned_cart:4_14", "")];
    tables.orders = [{ dealership_id: "d1", meta_campaign_id: null, total: 400, status: "paid" }];
    expect(await resultsByAudience(client(), "d1")).toEqual({});
  });

  it("'since' is the first ad to that group", async () => {
    tables.ad_creatives = [ad("buyers", "c1", { created_at: "2026-09-10T00:00:00Z" }), ad("buyers", "c2", { created_at: "2026-08-02T00:00:00Z" })];
    expect((await resultsByAudience(client(), "d1")).buyers.since).toBe("2026-08-02T00:00:00Z");
    // …whichever order they come back in.
    tables.ad_creatives.reverse();
    expect((await resultsByAudience(client(), "d1")).buyers.since).toBe("2026-08-02T00:00:00Z");
  });

  it("the line says what came back, or that nothing has yet", () => {
    expect(resultsLine(undefined)).toBeNull();
    expect(resultsLine({ ...EMPTY_RESULTS })).toBeNull();
    expect(resultsLine({ ...EMPTY_RESULTS, campaigns: 2 })).toBe("Nothing back yet from 2 ads to this group.");
    expect(resultsLine({ ...EMPTY_RESULTS, campaigns: 1, orders: 3, revenueInr: 4200 })).toBe("Brought back: 3 orders · ₹4,200");
    expect(resultsLine({ ...EMPTY_RESULTS, campaigns: 1, leads: 4, bookings: 2 })).toBe("Brought back: 2 bookings");
    // Enquiries are only worth saying when none of them booked yet.
    expect(resultsLine({ ...EMPTY_RESULTS, campaigns: 1, leads: 1 })).toBe("Brought back: 1 enquiry");
  });
});

describe("on the page", () => {
  it("each card carries its own group's results", async () => {
    tables.ad_creatives = [ad("abandoned_cart:1_3", "c1")];
    tables.orders = [{ dealership_id: "d1", meta_campaign_id: "c1", total: 1500, status: "paid" }];
    const body = await (await dashboard()).json();
    const first = body.segments.find((s: any) => s.key === "abandoned_cart:1_3");
    expect(first.resultsLine).toBe("Brought back: 1 order · ₹1,500");
    expect(first.results).toMatchObject({ orders: 1, revenueInr: 1500 });
    expect(body.segments.find((s: any) => s.key === "abandoned_cart:4_14").resultsLine).toBeNull();
  });

  it("the ad records which group it was for — from the panel and from the launch screen", () => {
    const campaign = readFileSync("src/app/api/retargeting/campaign/route.ts", "utf8");
    expect(campaign).toContain("retarget_audience_key: audienceKey,");
    const launch = readFileSync("src/app/api/ads/adlaunch/route.ts", "utf8");
    expect(launch).toContain(".update({ retarget_audience_key })");
    expect(launch).toContain('.eq("dealership_id", dealershipId);');
    const view = readFileSync("src/components/retargeting/RetargetingDashboard.tsx", "utf8");
    expect(view).toContain("{s.resultsLine}");
  });

  it("migration 194 adds the column it joins on, and the order attribution columns the storefront writes", () => {
    const sql = readFileSync("supabase/migrations/194_retargeting_results.sql", "utf8");
    expect(sql).toContain("alter table ad_creatives add column if not exists retarget_audience_key text;");
    expect(sql).toContain("alter table orders add column if not exists meta_campaign_id text;");
    expect(sql).toContain("create index if not exists idx_orders_meta_campaign on orders(dealership_id, meta_campaign_id);");
  });
});
