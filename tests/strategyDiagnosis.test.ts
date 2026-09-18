// Advanced Strategy, steps 1-2: where the business actually leaks, from its
// own last 90 days, and channel advice that can only quote those numbers.
//
// THE GAP (2026-09-18): the strategy tools knew the catalogue, offers,
// season and voice, but nothing about the funnel — so "where should I
// focus" got the same answer for every business in a category.
//
// THE RULE under test: every number is counted in code; code decides what's
// too thin to judge; the model only interprets, and any figure it quotes
// that isn't in the diagnosis is thrown out.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDiagnosis, diagnosisNumbers, formatDiagnosisForPrompt, MIN_SOURCE_LEADS, MIN_STEP_ENTRY, type DiagnosisInput } from "@/lib/strategy/diagnosis";
import { unverifiedNumbers, verifyAdvice } from "@/lib/strategy/channelAdvice";

const base = (over: Partial<DiagnosisInput> = {}): DiagnosisInput => ({
  models: ["products"],
  from: "2026-06-20",
  to: "2026-09-18",
  businessStart: "2026-01-01",
  events: [],
  leads: [],
  firstTouch: {},
  orders: [],
  abandonedCarts: 0,
  atRisk: [],
  paid: null,
  ...over,
});
const views = (n: number) => Array.from({ length: n }, () => ({ event_type: "view" }));
const leads = (n: number, status: string, source: string | null = "website", prefix = "L") =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${status}${source}${i}`, source, status }));

describe("step 1 — the funnel, with the weakest step named", () => {
  it("counts every step, the share that got through, and names the worst one", () => {
    const d = buildDiagnosis(base({
      events: views(400),
      leads: [...leads(20, "new"), ...leads(10, "called"), ...leads(4, "appointment_set"), ...leads(6, "converted")],
    }));
    const f = d.funnels[0];
    expect(f.steps.map((s) => [s.label, s.count, s.fromPrevious])).toEqual([
      ["Site visits", 400, null],
      ["Leads", 40, 10],
      ["Contacted", 20, 50],
      ["Visit booked", 10, 50],
      ["Purchased", 6, 60],
    ]);
    expect(f.weakest).toEqual({ from: "Site visits", to: "Leads", rate: 10, entered: 400 });
  });

  it("stage names follow the business model — a B2B funnel ends in 'Deal won'", () => {
    const d = buildDiagnosis(base({ models: ["b2b"], leads: leads(12, "converted") }));
    expect(d.funnels[0].steps.map((s) => s.label)).toEqual(["Site visits", "Leads", "Contacted", "Meeting booked", "Deal won"]);
    // No store funnel for a business with nothing to sell online.
    expect(d.funnels).toHaveLength(1);
  });

  it("a step with too few people entering it is never called the weakest", () => {
    const d = buildDiagnosis(base({ events: views(MIN_STEP_ENTRY - 1), leads: leads(1, "new") }));
    expect(d.funnels[0].weakest).toBeNull();
    expect(d.funnels[0].thin).toMatch(/Not enough traffic yet/);
    expect(d.gaps.some((g) => g.includes("Not enough traffic yet"))).toBe(true);
  });

  it("a store gets its own checkout funnel, counting paid orders and abandoned carts", () => {
    const d = buildDiagnosis(base({ events: views(200), orders: [{ status: "delivered" }, { status: "confirmed" }, { status: "cancelled" }], abandonedCarts: 38 }));
    const store = d.funnels.find((f) => f.name === "Online store")!;
    expect(store.steps.map((s) => [s.label, s.count])).toEqual([["Site visits", 200], ["Checkouts started", 40], ["Paid orders", 2]]);
    expect(store.weakest).toEqual({ from: "Checkouts started", to: "Paid orders", rate: 5, entered: 40 });
  });
});

describe("step 1 — lead sources ranked by conversion, not volume", () => {
  const d = buildDiagnosis(base({
    leads: [
      ...leads(19, "new", "instagram"), ...leads(1, "converted", "instagram"), // 20 leads, 5%
      ...leads(3, "new", "whatsapp"), ...leads(3, "converted", "whatsapp"), // 6 leads, 50%
      ...leads(2, "converted", "referral"), // 2 leads — too few
    ],
  }));

  it("the smaller, better-converting source ranks first", () => {
    expect(d.sources.map((s) => [s.source, s.leads, s.conversion, s.ranked])).toEqual([
      ["Whatsapp", 6, 50, true],
      ["Instagram", 20, 5, true],
      ["Referral", 2, null, false],
    ]);
  });

  it(`a source under ${MIN_SOURCE_LEADS} leads is listed but not ranked`, () => {
    expect(d.sources.at(-1)).toMatchObject({ source: "Referral", ranked: false, conversion: null });
    expect(d.sourcesThin).toBeNull();
  });

  it("with fewer than two sources big enough to compare, it says so", () => {
    const thin = buildDiagnosis(base({ leads: [...leads(3, "new", "instagram"), ...leads(2, "new", "whatsapp")] }));
    expect(thin.sourcesThin).toMatch(/Too few leads per source/);
    expect(thin.gaps.some((g) => g.startsWith("Lead sources:"))).toBe(true);
  });

  it("a lead with no source is filed under where it was first seen, else Unknown", () => {
    const d2 = buildDiagnosis(base({ leads: [{ id: "a", source: null, status: "new" }, { id: "b", source: null, status: "new" }], firstTouch: { a: "meta_ads_paid" } }));
    expect(d2.sources.map((s) => s.source).sort()).toEqual(["Meta ads paid", "Unknown"]);
  });
});

describe("step 1 — at-risk customers, paid ads, and the window", () => {
  it("counts only customers past the at-risk line", () => {
    const d = buildDiagnosis(base({ atRisk: [{ name: "Asha", daysSince: 120 }, { name: "Ravi", daysSince: 30 }, { name: "Neha", daysSince: 95 }] }));
    expect(d.atRisk).toEqual({ count: 2, total: 3, names: ["Asha", "Neha"] });
  });

  it("no ad history is a stated gap, not a zero", () => {
    expect(buildDiagnosis(base()).gaps.some((g) => g.startsWith("Paid ads:"))).toBe(true);
    const withAds = buildDiagnosis(base({ paid: [{ campaign: "Diwali", spend: 3000, leads: 12, costPerLead: 250 }] }));
    expect(withAds.gaps.some((g) => g.startsWith("Paid ads:"))).toBe(false);
  });

  it("a business younger than 90 days is told the window starts when it joined", () => {
    expect(buildDiagnosis(base({ businessStart: "2026-08-01" })).window.label).toBe("since you joined (2026-08-01)");
    expect(buildDiagnosis(base()).window.label).toBe("the last 90 days");
  });
});

describe("step 2 — advice may only quote the diagnosis's own numbers", () => {
  const d = buildDiagnosis(base({
    events: views(400),
    leads: [...leads(19, "new", "instagram"), ...leads(1, "converted", "instagram"), ...leads(3, "new", "whatsapp"), ...leads(3, "converted", "whatsapp")],
    paid: [{ campaign: "Diwali", spend: 3000, leads: 12, costPerLead: 250 }],
  }));
  const allowed = diagnosisNumbers(d);

  it("recognises real figures however they're written, and catches invented ones", () => {
    expect(unverifiedNumbers("WhatsApp converts at 50% against Instagram's 5%.", allowed)).toEqual([]);
    expect(unverifiedNumbers("Diwali cost ₹250 per lead across 12 leads.", allowed)).toEqual([]);
    expect(unverifiedNumbers("The industry average is 18% and you could reach 200 customers.", allowed)).toEqual(["18%", "200 customers"]);
    // A measured 6.5% may be quoted rounded as 7%; an invented decimal never
    // passes just because its rounding happens to equal a real count.
    expect(unverifiedNumbers("About 7% of visitors become leads.", allowed)).toEqual([]);
    expect(unverifiedNumbers("Only 3.5% convert.", allowed)).toEqual(["3.5%"]);
    // Numbers that aren't measurements aren't claims.
    expect(unverifiedNumbers("Step 2: run a 30-day test in week 1.", allowed)).toEqual([]);
  });

  it("a recommendation quoting an invented number is dropped, and the owner is told", () => {
    const v = verifyAdvice({
      summary: "Most visitors never become leads. Brands like you typically convert 3.5% of visits.",
      recommendations: [
        { title: "Move effort to WhatsApp", action: "Reply to every Instagram enquiry on WhatsApp.", evidence: "WhatsApp 50% vs Instagram 5%" },
        { title: "Double your leads", action: "Post daily to get 300 leads.", evidence: "benchmark" },
      ],
      dataGaps: [],
    }, d);
    expect(v.recommendations.map((r) => r.title)).toEqual(["Move effort to WhatsApp"]);
    expect(v.summary).toBe("Most visitors never become leads.");
    expect(v.removed).toHaveLength(2);
  });

  it("what the code judged too thin always reaches the owner, even if the model forgot it", () => {
    const thin = buildDiagnosis(base({ leads: leads(2, "new") }));
    const v = verifyAdvice({ summary: "", recommendations: [], dataGaps: [] }, thin);
    expect(v.dataGaps.some((g) => g.startsWith("Lead sources:"))).toBe(true);
    expect(v.dataGaps.some((g) => g.startsWith("Paid ads:"))).toBe(true);
  });

  it("the prompt hands over the measured numbers, and only those", () => {
    const text = formatDiagnosisForPrompt(d);
    expect(text).toMatch(/These are the ONLY numbers you may use/);
    expect(text).toContain("Weakest step: Site visits → Leads, 6.5% of 400.");
    expect(text).toContain("Whatsapp: 6 leads, 3 won, 50% conversion");
  });
});

describe("step 2 — the model call", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gets the diagnosis and the rules; its invented benchmark never reaches the owner", async () => {
    const prompts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: any, init?: any) => {
      prompts.push(JSON.parse(init.body).messages[0].content);
      const reply = {
        summary: "Visitors rarely become leads.",
        recommendations: [
          { title: "Fix the enquiry step", action: "Put a WhatsApp button on every product.", evidence: "Leads are 6.5% of 400 visits" },
          { title: "Match the market", action: "Aim for the 12% industry norm.", evidence: "benchmark" },
        ],
        dataGaps: [],
      };
      return new Response(JSON.stringify({ content: [{ text: JSON.stringify(reply) }], usage: {} }), { status: 200 });
    }));
    const { generateChannelAdvice } = await import("@/lib/strategy/channelAdvice");
    const d = buildDiagnosis(base({ events: views(400), leads: [...leads(25, "new"), ...leads(1, "converted")] }));
    const advice = await generateChannelAdvice(d, null);
    expect(prompts[0]).toContain("MEASURED DIAGNOSIS");
    expect(prompts[0]).toMatch(/Never state, estimate or round a figure that isn't in the diagnosis/);
    expect(advice!.recommendations.map((r) => r.title)).toEqual(["Fix the enquiry step"]);
    expect(advice!.removed).toHaveLength(1);
  });

  it("a failed call is null, never made-up advice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const { generateChannelAdvice } = await import("@/lib/strategy/channelAdvice");
    expect(await generateChannelAdvice(buildDiagnosis(base()), null)).toBeNull();
  });
});

// ---- the real loader, route and chat card, over a fake database --------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: (_c?: string, o?: any) => ((head = Boolean(o?.head)), api),
      order: () => api,
      limit: () => api,
      range: () => api,
      not: () => api,
      is: () => api,
      neq: (k: string, v: any) => (filters.push((r) => r[k] !== v), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      gte: (k: string, v: any) => (filters.push((r) => r[k] === undefined || String(r[k]) >= String(v)), api),
      lte: (k: string, v: any) => (filters.push((r) => r[k] === undefined || String(r[k]) <= String(v)), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(head ? { data: null, count: rows().length, error: null } : { data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

const RECENT = "2026-09-01T10:00:00+05:30";
const OLD = "2026-01-01T10:00:00+05:30";

beforeEach(() => {
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", business_models: ["products"], created_at: "2025-12-01T00:00:00Z" }],
    products: [{ dealership_id: "d1", kind: "product", is_active: true }],
    page_events: [
      ...Array.from({ length: 50 }, () => ({ dealership_id: "d1", event_type: "view", created_at: RECENT })),
      ...Array.from({ length: 500 }, () => ({ dealership_id: "d1", event_type: "view", created_at: OLD })),
    ],
    leads: [
      { id: "L1", dealership_id: "d1", source: null, status: "converted", created_at: RECENT, name: "Asha" },
      { id: "L2", dealership_id: "d1", source: "instagram", status: "new", created_at: RECENT, name: "Ravi" },
      { id: "L0", dealership_id: "d1", source: "instagram", status: "new", created_at: OLD, name: "Old" },
    ],
    lead_touchpoints: [{ dealership_id: "d1", lead_id: "L1", channel: "whatsapp", occurred_at: RECENT }],
    orders: [],
    abandoned_carts: [],
    calls: [],
    appointments: [],
    campaign_performance_history: [
      { dealership_id: "d1", ad_creative_id: "c1", snapshot_date: "2026-06-01", headline: "Diwali", spend: 1000, leads: 4 },
      { dealership_id: "d1", ad_creative_id: "c1", snapshot_date: "2026-09-10", headline: "Diwali", spend: 4000, leads: 16 },
    ],
  };
});

describe("the loader reads the business's own last 90 days", () => {
  it("counts only this window, uses first touch for a source-less lead, and spend as a difference of running totals", async () => {
    const { loadDiagnosis } = await import("@/lib/strategy/diagnosis");
    const d = await loadDiagnosis(db(), "d1", "2026-09-18");
    expect(d.funnels[0].steps.slice(0, 2).map((s) => s.count)).toEqual([50, 2]);
    expect(d.sources.map((s) => s.source).sort()).toEqual(["Instagram", "Whatsapp"]);
    // Running totals: 4000 at the end, 1000 before the window → 3000 spent in it, 12 leads.
    expect(d.paid).toEqual([{ campaign: "Diwali", spend: 3000, leads: 12, costPerLead: 250 }]);
  });
});

describe("the Strategy page's route", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the diagnosis without a model call; advice only when asked", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ content: [{ text: '{"summary":"","recommendations":[],"dataGaps":[]}' }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("@/app/api/strategy/diagnosis/route");
    const plain = await (await GET(new Request("https://x.test/api/strategy/diagnosis"))).json();
    expect(plain.diagnosis.funnels[0].steps[0].count).toBe(50);
    expect(plain.advice).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    const withAdvice = await (await GET(new Request("https://x.test/api/strategy/diagnosis?advice=1"))).json();
    expect(withAdvice.advice).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe("the chat card", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("diagnose_business returns the numbers and shows them as a card with the weakest step and ranked sources", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ text: '{"summary":"Few visits become leads.","recommendations":[],"dataGaps":[]}' }] }), { status: 200 })));
    const { executeTool, extractArtifact, TOOLS } = await import("@/lib/agents/masterBrainV2");
    expect(TOOLS.some((t: any) => t.name === "diagnose_business")).toBe(true);
    const result = await executeTool(db(), { id: "d1", name: "Candle by Qaaf", category: "Home fragrance" } as any, "diagnose_business", {}, "");
    expect(result.diagnosis.funnels[0].steps[0].count).toBeGreaterThan(0);
    const card: any = extractArtifact("diagnose_business", {}, result);
    expect(card.kind).toBe("document");
    expect(card.groups.map((g: any) => g.heading)).toEqual(expect.arrayContaining(["Lead sources, ranked by conversion", "Customers at risk"]));
    expect(card.departmentHref).toBe("/dashboard/strategy");
  });
});
