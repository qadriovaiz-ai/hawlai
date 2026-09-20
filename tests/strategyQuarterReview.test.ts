// Advanced Strategy step 5b (2026-09-20): how the quarter actually went.
//
// A week counts as done only when something was CREATED from it — the link
// travels with "Create this" and is checked against the business's own
// plan, so a request body can't claim a week. What came back is the
// quarter's own retargeting results (R5), and the funnel is compared with
// the numbers saved when the quarter was planned — steps the baseline
// never recorded are left out rather than shown as growth from zero.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" = "select";
  let payload: Row | null = null;
  const run = () => {
    if (op === "insert") {
      const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, created_at: new Date().toISOString(), ...payload };
      (tables[table] ??= []).push(row);
      return { data: row, error: null };
    }
    return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
  };
  const api: any = {
    select: () => api, order: () => api, limit: () => api, or: () => api, lt: () => api, neq: () => api, in: () => api, is: () => api,
    gte: (c: string, v: any) => (filters.push((r) => !(c in r) || String(r[c]) >= String(v)), api),
    not: (c: string, op2: string, v: any) => (filters.push((r) => (op2 === "is" && v === null ? r[c] != null : true)), api),
    eq: (c: string, v: any) => (filters.push((r) => !(c in r) || r[c] === v), api),
    insert: (p: Row) => ((op = "insert"), (payload = p), api),
    single: async () => {
      const { data } = run();
      return { data: Array.isArray(data) ? data[0] ?? null : data, error: null };
    },
    maybeSingle: async () => {
      const { data } = run();
      return { data: Array.isArray(data) ? data[0] ?? null : data, error: null };
    },
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}
const client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: (t: string) => query(t) });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));

let diagnosisNow: any;
vi.mock("@/lib/strategy/diagnosis", async (orig) => ({ ...(await orig<any>()), loadDiagnosis: async () => { if (!diagnosisNow) throw new Error("down"); return diagnosisNow; } }));
vi.mock("@/lib/claims/businessFacts", async (orig) => ({ ...(await orig<any>()), gatherBusinessFactsSafely: async () => ({ businessName: "Candle by Qaaf", ownerFacts: [], offers: [], products: [] }) }));
vi.mock("@/lib/agents/contentMarketingAgent", async (orig) => ({ ...(await orig<any>()), generateContent: async () => ({ output: { caption: "A post" }, _fallback: false, _aiFailure: null }) }));
vi.mock("@/lib/content/recentCopy", () => ({ recentCopy: async () => [] }));

import { reviewQuarter, compareFunnels } from "@/lib/strategy/calendar/review";
import { GET as calendar } from "@/app/api/strategy/calendar/route";
import { POST as generate } from "@/app/api/content-marketing/generate/route";
import { createHref } from "@/components/strategy/CalendarPanel";

const QUARTER = {
  id: "q1",
  dealership_id: "d1",
  starts_on: "2026-09-21",
  ends_on: "2026-12-20",
  created_at: "2026-09-20T00:00:00Z",
  weeks: [{ week: 1 }, { week: 2 }, { week: 3 }],
  baseline: {
    funnels: [{ name: "Store", steps: [{ key: "views", label: "Visitors", count: 400 }, { key: "leads", label: "Leads", count: 6 }] }],
    atRisk: { count: 3, total: 9 },
  },
  notes: {},
};

const NOW_DIAGNOSIS = {
  funnels: [{ name: "Store", steps: [{ key: "views", label: "Visitors", count: 520 }, { key: "leads", label: "Leads", count: 11 }], weakest: null, thin: null }],
  atRisk: { count: 2, total: 12, names: [] },
  window: { label: "last 90 days" },
  sources: [],
  gaps: [],
};

beforeEach(() => {
  diagnosisNow = NOW_DIAGNOSIS;
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance" }],
    brand_profiles: [],
    strategy_quarters: [{ ...QUARTER }],
    content_pieces: [],
    ad_creatives: [],
    orders: [],
    leads: [],
    appointments: [],
  };
});
afterEach(() => vi.restoreAllMocks());

describe("what was actually made", () => {
  it("a week counts only when something was created FROM it", async () => {
    tables.content_pieces = [
      { dealership_id: "d1", strategy_quarter_id: "q1", strategy_week: 1 },
      { dealership_id: "d1", strategy_quarter_id: "q1", strategy_week: 1 },
      { dealership_id: "d1", strategy_quarter_id: "q1", strategy_week: 3 },
      // Made the same week, but not from the plan: not that week's work.
      { dealership_id: "d1", strategy_quarter_id: null, strategy_week: null },
      // Another business's, and another quarter's.
      { dealership_id: "d2", strategy_quarter_id: "q1", strategy_week: 2 },
      { dealership_id: "d1", strategy_quarter_id: "q-old", strategy_week: 2 },
    ];
    const r = await reviewQuarter(client(), "d1", QUARTER as any, NOW_DIAGNOSIS as any);
    expect(r.made).toEqual([{ week: 1, made: 2 }, { week: 2, made: 0 }, { week: 3, made: 1 }]);
    expect(r).toMatchObject({ weeksTotal: 3, weeksWithSomethingMade: 2 });
  });

  it("what the quarter's own retargeting ads brought back — not earlier ones", async () => {
    tables.ad_creatives = [
      { dealership_id: "d1", retarget_audience_key: "abandoned_cart:1_3", meta_campaign_id: "c1", created_at: "2026-10-01T00:00:00Z" },
      // Launched before this quarter started.
      { dealership_id: "d1", retarget_audience_key: "buyers", meta_campaign_id: "c0", created_at: "2026-08-01T00:00:00Z" },
    ];
    tables.orders = [
      { dealership_id: "d1", meta_campaign_id: "c1", total: 1500, status: "paid" },
      { dealership_id: "d1", meta_campaign_id: "c0", total: 9000, status: "paid" },
    ];
    const r = await reviewQuarter(client(), "d1", QUARTER as any, NOW_DIAGNOSIS as any);
    expect(r.broughtBack).toEqual({ orders: 1, revenueInr: 1500, bookings: 0 });
  });

  it("the funnel is compared with the numbers saved when the quarter was planned", async () => {
    const r = await reviewQuarter(client(), "d1", QUARTER as any, NOW_DIAGNOSIS as any);
    expect(r.funnel).toEqual([
      { name: "Store", steps: [
        { label: "Visitors", then: 400, now: 520, change: 120 },
        { label: "Leads", then: 6, now: 11, change: 5 },
      ] },
    ]);
  });

  it("a step the baseline never recorded isn't growth from zero", () => {
    const baseline = { funnels: [{ name: "Store", steps: [{ key: "views", label: "Visitors", count: 400 }] }] };
    expect(compareFunnels(baseline, NOW_DIAGNOSIS as any)[0].steps.map((s) => s.label)).toEqual(["Visitors"]);
    // A step the baseline holds without a number is no comparison either.
    const noNumber = { funnels: [{ name: "Store", steps: [{ key: "views", label: "Visitors", count: 400 }, { key: "leads", label: "Leads" }] }] };
    expect(compareFunnels(noNumber, NOW_DIAGNOSIS as any)[0].steps.map((s) => s.label)).toEqual(["Visitors"]);
    expect(compareFunnels(null, NOW_DIAGNOSIS as any)).toEqual([]);
    expect(compareFunnels(baseline, null)).toEqual([]);
  });

  it("no baseline, or no numbers today: said plainly, not left blank", async () => {
    const noBaseline = await reviewQuarter(client(), "d1", { ...QUARTER, baseline: null } as any, NOW_DIAGNOSIS as any);
    expect(noBaseline.funnel).toEqual([]);
    expect(noBaseline.notes[0]).toMatch(/^This quarter was planned before your numbers could be read/);

    const noNow = await reviewQuarter(client(), "d1", QUARTER as any, null);
    expect(noNow.notes[0]).toBe("Couldn't read your last 90 days just now, so the funnel isn't compared.");
  });
});

describe("the link a week's work carries", () => {
  it("'Create this' carries the quarter and week", () => {
    const href = createHref({ week: 4, idea: { title: "Why soy wax", format: "carousel", idea: "Show the supplier." } } as any, "q1")!;
    const u = new URL(href, "https://x.test");
    expect(u.searchParams.get("quarter")).toBe("q1");
    expect(u.searchParams.get("week")).toBe("4");
    // Without a quarter it's still a normal link.
    expect(new URL(createHref({ week: 4, idea: { title: "t", format: "carousel", idea: "i" } } as any)!, "https://x.test").searchParams.get("week")).toBeNull();
  });

  it("the piece is linked only to a week this business's own plan really has", async () => {
    const make = (body: Row) => generate(new Request("https://hawlai.test/api/content-marketing/generate", { method: "POST", body: JSON.stringify({ contentType: "carousel", topic: "x", ...body }) }));

    await make({ quarterId: "q1", week: 2 });
    expect(tables.content_pieces.at(-1)).toMatchObject({ strategy_quarter_id: "q1", strategy_week: 2 });

    // A week the plan doesn't have.
    await make({ quarterId: "q1", week: 99 });
    expect(tables.content_pieces.at(-1)!.strategy_quarter_id).toBeUndefined();

    // Another business's plan.
    tables.strategy_quarters = [{ ...QUARTER, dealership_id: "d2" }];
    await make({ quarterId: "q1", week: 1 });
    expect(tables.content_pieces.at(-1)!.strategy_quarter_id).toBeUndefined();

    // No link at all: a normal piece.
    await make({});
    expect(tables.content_pieces.at(-1)!.strategy_week).toBeUndefined();
  });
});

describe("the route", () => {
  const look = (q = "") => calendar(new Request(`https://hawlai.test/api/strategy/calendar${q}`));

  it("the review is only read when asked for", async () => {
    const plain = await (await look()).json();
    expect(plain.quarter.id).toBe("q1");
    expect(plain.review).toBeUndefined();

    tables.content_pieces = [{ dealership_id: "d1", strategy_quarter_id: "q1", strategy_week: 1 }];
    const asked = await (await look("?review=1")).json();
    expect(asked.review).toMatchObject({ weeksWithSomethingMade: 1, weeksTotal: 3 });
    expect(asked.review.funnel[0].steps[0]).toMatchObject({ then: 400, now: 520 });
  });

  it("with no plan yet there's nothing to review", async () => {
    tables.strategy_quarters = [];
    const body = await (await look("?review=1")).json();
    expect(body).toEqual({ quarter: null });
  });

  it("the page asks for it on a click, and shows what was made per week", () => {
    const panel = readFileSync("src/components/strategy/CalendarPanel.tsx", "utf8");
    expect(panel).toContain('fetch("/api/strategy/calendar?review=1")');
    expect(panel).toContain("How is it going?");
    expect(panel).toContain("· made {made(w.week)}");
    // The link out of a week carries that week (step 5).
    expect(panel).toContain("createHref(w, quarter.id)");
  });
});
