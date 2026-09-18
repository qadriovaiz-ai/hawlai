// Paid Ads copy can't invent an offer — same fix as Retargeting.
//
// THE BUG (2026-09-18): the ad writer's own output format asked the body to
// "mention offer/urgency". No caller passed the business facts and nothing
// ran the claims check, so every Paid Ads draft — the launcher, preview,
// chat, and the A/B variant the autopilot writes on its own — could invent
// a discount or free shipping under the owner's name. The fallback headline
// said "Special Offer". The Paid Ads page's own writer (ad copy for Google,
// LinkedIn and the rest) had the same gap.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserted: { table: string; row: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert") {
        const row = { id: `${table}-1`, ...payload };
        inserted.push({ table, row });
        return { data: row, error: null };
      }
      if (op === "update") return { data: { id: `${table}-1`, ...payload }, error: null };
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, not: () => api, is: () => api, in: () => api, neq: () => api, range: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      upsert: () => api,
      maybeSingle: async () => run(true),
      single: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return {
    from,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://cdn.test/ad.png" } }) }) },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
// The ad's picture isn't under test: only its words.
vi.mock("@/lib/adEngine", async (orig) => ({ ...(await orig<typeof import("@/lib/adEngine")>()), buildFinalCreativeImage: async () => Buffer.from("png") }));
vi.mock("@/lib/ads/adAccountLimits", () => ({
  getAdAccountLimits: async () => ({ minDailyBudget: null, accountStatus: 1 }),
  clampBudgetToMinimum: (n: number) => ({ minor: n, raised: false }),
  describeMinimum: () => null,
  isAccountUsable: () => ({ usable: true }),
}));
vi.mock("@/lib/agents/analyticsAgent", async (orig) => ({ ...(await orig<typeof import("@/lib/agents/analyticsAgent")>()), getCampaignPerformanceState: async () => ({ state: "ok", value: { campaigns: [] } }) }));

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Shahjahanpur",
    site: null,
    home: null,
    products: [{ id: "p1", name: "Lavender candle", kind: "product", price: 550, description: "Soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: null, products: [], booking: null },
    season: seasonFor([], "2026-09-18"),
    unreadable: [],
    ...over,
  };
}

let prompts: string[];
function model(reply: Row) {
  vi.stubGlobal("fetch", vi.fn(async (_u: any, init?: any) => {
    if (init?.body) {
      try { prompts.push(JSON.parse(init.body).messages?.[0]?.content ?? ""); } catch { /* not a model call */ }
    }
    return new Response(JSON.stringify({ content: [{ text: JSON.stringify(reply) }], usage: {} }), { status: 200 });
  }));
}

// What the ad writer comes back with when it invents an offer. Scored high
// so the one-retry path doesn't fire.
const INVENTED_AD = {
  headline: "Flat 20% off today",
  body: "Hand-poured Lavender candle. Free delivery on every order!",
  daily_budget: 500,
  targeting_city: null,
  background_style: "studio_white",
  image_scene_prompt: "studio",
  confidence_score: 90,
  score_reasoning: "clear",
};

beforeEach(() => {
  prompts = [];
  inserted = [];
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur" }],
    websites: [{ id: "w1", dealership_id: "d1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
    products: [{ id: "p1", dealership_id: "d1", name: "Lavender candle", price: 550, is_active: true, images: [] }],
  };
});
afterEach(() => vi.unstubAllGlobals());

describe("the ad writer (headline + body for Meta ads)", () => {
  it("no longer asks for an offer, and allows one only when the facts list it", () => {
    const src = readFileSync("src/lib/adEngine.ts", "utf8");
    expect(src).not.toMatch(/mention offer\/urgency/);
    expect(src).toMatch(/ONLY if the verified facts list it as active/);
  });

  it("an invented discount and free delivery are removed; the owner is told; nothing goes out blank", async () => {
    model(INVENTED_AD);
    const { generateAdPlan } = await import("@/lib/adEngine");
    const plan: any = await generateAdPlan("lavender candle ad", null, "Home fragrance", undefined, null, facts());
    expect(plan.body).toBe("Hand-poured Lavender candle.");
    // The whole headline was the invented offer: an honest one instead.
    expect(plan.headline).toBe("Candle by Qaaf");
    expect(plan._claimsNote).toMatch(/Hawlai removed/);
    expect(prompts[0]).toContain("VERIFIED FACTS");
  });

  it("a real, live offer stays", async () => {
    model({ ...INVENTED_AD, headline: "10% off with WELCOME10", body: "Hand-poured Lavender candle." });
    const { generateAdPlan } = await import("@/lib/adEngine");
    const plan: any = await generateAdPlan("lavender", null, "Home fragrance", undefined, null, facts({ offers: [{ code: "WELCOME10", label: "10% off", percent: 10, flat: null }] }));
    expect(plan.headline).toBe("10% off with WELCOME10");
  });

  it("the fallback headline claims no offer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const { generateAdPlan } = await import("@/lib/adEngine");
    const plan: any = await generateAdPlan("lavender", null, "Home fragrance", undefined, "Shahjahanpur");
    expect(plan.headline).not.toMatch(/offer|sale|discount|%/i);
    expect(plan.headline).toBe("Home fragrance in Shahjahanpur");
  });
});

describe("every caller passes the facts", () => {
  it("the ad preview route saves a checked draft", async () => {
    model(INVENTED_AD);
    const { POST } = await import("@/app/api/ads/preview/route");
    const res = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ photo_base64: "data:image/png;base64,AAAA", prompt: "An ad for our lavender candle", image_mode: "template" }) }));
    expect(res.status).toBe(200);
    const draft = inserted.find((i) => i.table === "ad_creatives")!.row;
    expect(draft.body_copy).toBe("Hand-poured Lavender candle.");
    expect(draft.headline).not.toMatch(/20% off/);
    expect(prompts.some((p) => p.includes("VERIFIED FACTS"))).toBe(true);
  });

  it("the launcher, the A/B variant autopilot and chat pass the facts too", () => {
    expect(readFileSync("src/app/api/ads/adlaunch/route.ts", "utf8")).toMatch(/dealership\?\.city \?\? null, await gatherBusinessFactsSafely\(supabase, dealershipId\)\);/);
    expect(readFileSync("src/lib/agents/autopilotAgent.ts", "utf8")).toMatch(/generateAdPlan\(variantPrompt, brandProfile, businessCategory, \{ supabase, dealershipId \}, null, await gatherBusinessFactsSafely\(supabase, dealershipId\)\)/);
    expect(readFileSync("src/lib/agents/masterBrainV2.ts", "utf8")).toMatch(/makePlan\(askedFor, brand, [^;]*await factsFor\(supabase, ctx\)\);/);
  });
});

describe("the Paid Ads page's writer (copy for Google, LinkedIn and the rest)", () => {
  it("ad copy is written from the facts and checked", async () => {
    model({ headlines: ["Hand-poured Lavender", "Flat 30% off this week"], primaryText: ["Soy wax, poured in Shahjahanpur."], descriptions: ["Free shipping on all orders"] });
    const { POST } = await import("@/app/api/paid-ads/generate/route");
    const res = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ platform: "google", taskType: "ad_copy" }) }));
    const { output } = await res.json();
    expect(prompts[0]).toContain("VERIFIED FACTS");
    expect(output.headlines).toEqual(["Hand-poured Lavender"]);
    expect(JSON.stringify(output.descriptions ?? [])).not.toMatch(/free shipping/i);
    expect(output._claimsNote).toMatch(/Hawlai removed/);
  });

  it("advice to the owner isn't treated as ad copy — a suggested ₹500/day budget stays", async () => {
    model({ recommendedDailyBudgetRange: "₹500-₹800 a day to start", allocation: [] });
    const { POST } = await import("@/app/api/paid-ads/generate/route");
    const res = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ platform: "google", taskType: "budget_allocation" }) }));
    const { output } = await res.json();
    expect(output.recommendedDailyBudgetRange).toBe("₹500-₹800 a day to start");
    expect(output._claimsNote).toBeUndefined();
  });

  it("chat's Paid Ads tool passes the facts", () => {
    expect(readFileSync("src/lib/agents/masterBrainV2.ts", "utf8")).toMatch(/generateAdPlan\(input\.platform, input\.taskType, [^;]*groundingContext, await factsFor\(supabase, ctx\)\);/);
  });
});
