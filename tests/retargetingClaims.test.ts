// Retargeting copy can't invent an offer.
//
// THE BUG (found 2026-09-18): the abandoned-cart prompt told the model to
// "assume a small discount or free shipping might be offered — mention it
// generically". Neither the copy route nor the campaign-draft route passed
// the business facts, and nothing ran the claims check, so an invented
// discount or free shipping could reach a live ad under the owner's name.
// The fallback copy promised "a little something" that didn't exist.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { generateRetargetingCopy } from "@/lib/agents/retargetingAgent";
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
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null, count: found.length };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, not: () => api, is: () => api, in: () => api, neq: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: () => api, upsert: () => api,
      maybeSingle: async () => run(true),
      single: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/featureGate", () => ({ requireFeature: async () => ({ allowed: true }) }));

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

const INVENTED = {
  headline: "Your cart misses you",
  primaryText: "Your Lavender candle is waiting. Free shipping on your first order!",
  cta: "Shop Now",
  variant2Headline: "Come back",
  variant2PrimaryText: "Flat 20% off till Sunday.",
};

beforeEach(() => {
  prompts = [];
  inserted = [];
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur" }],
    websites: [{ id: "w1", dealership_id: "d1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
    products: [{ id: "p1", dealership_id: "d1", name: "Lavender candle", price: 550, is_active: true, images: [] }],
    abandoned_carts: [{ dealership_id: "d1", contacted: false, items: [{ name: "Lavender candle" }] }],
    meta_custom_audiences: [{ dealership_id: "d1", audience_key: "abandoned_cart", meta_audience_id: "aud_1", sync_status: "synced" }],
  };
});
afterEach(() => vi.unstubAllGlobals());

describe("the prompt no longer asks for an invented offer", () => {
  it("the abandoned-cart instruction to 'assume a discount or free shipping' is gone", () => {
    const src = readFileSync("src/lib/agents/retargetingAgent.ts", "utf8");
    expect(src).not.toMatch(/Assume a small discount or free shipping/);
    expect(src).toMatch(/ONLY if the verified facts list it as an active offer/);
  });

  it("the copy is written from the business facts and truth rules", async () => {
    model(INVENTED);
    await generateRetargetingCopy("abandoned_cart", "candle_by_qaaf", "Home fragrance", "Lavender candle", undefined, undefined, facts());
    expect(prompts[0]).toContain("VERIFIED FACTS");
    expect(prompts[0]).toMatch(/TRUTH RULES/);
    expect(prompts[0]).toContain("Candle by Qaaf");
    expect(prompts[0]).not.toContain("candle_by_qaaf");
  });
});

describe("an invented offer never survives", () => {
  it("free shipping on a flat-rate store and an unbacked 20% off are removed, and the owner is told", async () => {
    model(INVENTED);
    const r = await generateRetargetingCopy("abandoned_cart", "candle_by_qaaf", "Home fragrance", "", undefined, undefined, facts());
    expect(r.primaryText).toBe("Your Lavender candle is waiting.");
    expect(r.primaryText).not.toMatch(/free shipping/i);
    // The whole variant was the invented offer: replaced by the honest line, never blank.
    expect(r.variant2PrimaryText).not.toMatch(/20%|off/i);
    expect(r.variant2PrimaryText.trim()).not.toBe("");
    expect(r._claimsNote).toMatch(/Hawlai removed/);
  });

  it("a real, live offer is allowed", async () => {
    model({ ...INVENTED, primaryText: "Your Lavender candle is waiting — 10% off with WELCOME10." });
    const withOffer = facts({ offers: [{ code: "WELCOME10", label: "10% off", percent: 10, flat: null }] });
    const r = await generateRetargetingCopy("abandoned_cart", "candle_by_qaaf", "Home fragrance", "", undefined, undefined, withOffer);
    expect(r.primaryText).toContain("10% off with WELCOME10");
  });

  it("the fallback copy promises nothing that doesn't exist, for every segment", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    for (const seg of ["abandoned_cart", "cold_lead", "lapsed_buyer"] as const) {
      const r = await generateRetargetingCopy(seg, "candle_by_qaaf", "Home fragrance", "");
      const text = JSON.stringify(r);
      expect(text, seg).not.toMatch(/something extra|little something|waiting for you|% ?off|free|discount|gift/i);
      expect(text, seg).toContain("Candle by Qaaf");
      expect(text, seg).not.toContain("candle_by_qaaf");
    }
    // A cold lead never had a cart.
    const cold = await generateRetargetingCopy("cold_lead", "x", "y", "");
    expect(JSON.stringify(cold)).not.toMatch(/cart|saved this/i);
  });
});

describe("both routes pass the facts", () => {
  it("the copy route: facts reach the prompt, and the saved copy is checked", async () => {
    model(INVENTED);
    const { POST } = await import("@/app/api/retargeting/generate/route");
    const res = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ segmentType: "abandoned_cart" }) }));
    expect(res.status).toBe(200);
    expect(prompts.some((p) => p.includes("VERIFIED FACTS"))).toBe(true);
    const saved = inserted.find((i) => i.table === "retargeting_campaigns")!.row.output;
    // The copy itself — the note quotes what it removed, by design.
    const { _claimsNote, ...copy } = saved;
    expect(JSON.stringify(copy)).not.toMatch(/free shipping|20% off/i);
    expect(_claimsNote).toMatch(/Hawlai removed/);
  });

  it("the campaign draft: the ad writer gets the facts, and the saved headline/body are checked", async () => {
    model({ headline: "Free delivery today", body: "Your Lavender candle is waiting. Flat 20% off till Sunday.", confidence_score: 90, score_reasoning: "clear", background_style: "studio_white" });
    const { POST } = await import("@/app/api/retargeting/campaign/route");
    const res = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ audienceKey: "abandoned_cart" }) }));
    expect(res.status).toBe(200);
    expect(prompts.some((p) => p.includes("VERIFIED FACTS"))).toBe(true);
    const draft = inserted.find((i) => i.table === "ad_creatives")!.row;
    expect(draft.body_copy).toBe("Your Lavender candle is waiting.");
    expect(draft.headline).not.toMatch(/free delivery/i);
    expect(draft.headline.trim()).not.toBe("");
  });
});
