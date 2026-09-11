// CRO suggestions may only claim what the business can back up.
//
// THE LIVE CASE: for candle_by_qaaf (1 paid order, flat-rate shipping,
// a live six-page site), CRO suggested publishing "Loved by 500+ homes
// across India ✦ All-natural wax ✦ Phthalate-free fragrance", "Free
// shipping on your first order", and "Every candle ships in a keepsake
// box" — and said "No headline set" about a site whose home page reads
// "A mood, not just a candle." Every test below starts from that shape.

import { describe, it, expect, vi, afterEach } from "vitest";
import { gatherCroFacts, blocksText, findUnsupportedClaims, scrubCroOutput, formatFactsForPrompt, type CroFacts } from "@/lib/cro/siteFacts";
import { generateCroSuggestions } from "@/lib/agents/croAgentV2";
import { analyzeCro } from "@/lib/agents/croAgent";

afterEach(() => vi.unstubAllGlobals());

type Row = Record<string, any>;

const HOME_BLOCKS = [
  {
    id: "s1", type: "section", props: {},
    children: [{
      id: "k1", type: "stack", props: {},
      children: [
        { id: "h1", type: "heading", props: { text: "A mood, not just a candle.", level: 1 } },
        { id: "t1", type: "text", props: { html: "<p>Candle by Qaaf makes hand-poured soy wax candles. Each candle arrives in premium, gift-ready packaging.</p>" } },
        { id: "b1", type: "button", props: { label: "Shop the Collection", href: "/shop" } },
      ],
    }],
  },
];

function db(tables: Record<string, Row[]>, errors: Record<string, string> = {}) {
  return {
    from: (table: string) => {
      const api: any = {
        select: () => api, eq: () => api, gte: () => api, order: () => api, limit: () => api, not: () => api,
        maybeSingle: async () => (errors[table] ? { data: null, error: { message: errors[table] } } : { data: (tables[table] ?? [])[0] ?? null, error: null }),
        single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
        then: (resolve: any) => resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: tables[table] ?? [], error: null }),
      };
      return api;
    },
  };
}

const recent = new Date().toISOString();
const CANDLE: Record<string, Row[]> = {
  dealerships: [{ dealership_name: "candle_by_qaaf", business_category: "Home fragrance" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }],
  website_pages: [{ slug: "home", title: "Home", page_type: "home", meta_description: "Hand-poured candles", og_image_url: null, sections: HOME_BLOCKS, order_index: 0 }],
  products: [{ name: "Lavender candle", price: 550, description: null }],
  discount_codes: [],
  page_events: Array.from({ length: 13 }, () => ({ event_type: "view" })),
  orders: [{ status: "delivered", created_at: recent }],
  leads: [],
  abandoned_carts: [],
  landing_pages: [],
  ad_creatives: [],
};

// The suggestions the live audit actually got back.
const LIVE_AUDIT_OUTPUT = {
  suggestions: [
    { issue: "No headline set", fix: "Set headline to 'Hand-Poured Candles That Transform Your Space Into a Sanctuary'", reasoning: "13 visitors, 0% engagement." },
    { issue: "No subheadline", fix: "Add subheadline: 'Small-batch, fragrance-forward candles crafted in India'", reasoning: "Builds trust." },
    { issue: "No offer text", fix: "Add offer copy: 'Free shipping on your first order — shop before it sells out'", reasoning: "Urgency." },
    { issue: "No social proof", fix: "Add a trust badge: 'Loved by 500+ homes across India ✦ All-natural wax ✦ Phthalate-free fragrance'", reasoning: "Credibility." },
    { issue: "Doesn't speak to gifting", fix: "Add: 'Looking for a gift? Every candle ships in a keepsake box — ready to give'", reasoning: "Gifting persona." },
  ],
};

describe("the facts come from the live site, not the empty landing-page record", () => {
  it("reads the real home page headline, copy and buttons out of the block tree", async () => {
    const facts = await gatherCroFacts(db(CANDLE), "d1");
    expect(facts.site).toMatchObject({ url: "/site/candle-by-qaaf", published: true });
    expect(facts.home!.headings[0]).toBe("A mood, not just a candle.");
    expect(facts.home!.buttons).toEqual(["Shop the Collection"]);
    expect(facts.allTime.paidOrders).toBe(1);
    expect(facts.shipping!.mode).toBe("flat");
    expect(formatFactsForPrompt(facts)).toContain('Home page headline: "A mood, not just a candle."');
  });

  it("reads pre-block-builder pages too", () => {
    expect(blocksText([{ type: "hero", headline: "Old headline", subheadline: "Old copy", ctaText: "Call us" }])).toEqual({
      headings: ["Old headline"], paragraphs: ["Old copy"], buttons: ["Call us"],
    });
  });

  it("a read that fails is 'unknown', never 'none'", async () => {
    const facts = await gatherCroFacts(db(CANDLE, { products: "timeout" }), "d1");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(facts.unreadable).toContain("products");
    expect(formatFactsForPrompt(facts)).toMatch(/Couldn't be read right now.*products/);
  });
});

describe("claims are checked against the facts", () => {
  let facts: CroFacts;
  const load = async () => (facts = await gatherCroFacts(db(CANDLE), "d1"));

  it("'Loved by 500+ homes' with 1 order on record → unsupported", async () => {
    await load();
    const r = findUnsupportedClaims("Loved by 500+ homes across India", facts);
    expect(r.join(" ")).toMatch(/500\+ homes.*1 paid order/);
  });

  it("any customer count above the real one is caught; the real count is fine", async () => {
    await load();
    expect(findUnsupportedClaims("Trusted by 2,000 happy customers", facts)).toHaveLength(1);
    expect(findUnsupportedClaims("Our first 1 order shipped last week", facts)).toHaveLength(0);
  });

  it("free shipping when the store charges flat shipping → unsupported", async () => {
    await load();
    expect(findUnsupportedClaims("Free shipping on your first order", facts).join(" ")).toMatch(/free shipping.*₹60 flat/);
  });

  it("packaging the site never mentions → unsupported; packaging it does mention → fine", async () => {
    await load();
    expect(findUnsupportedClaims("Every candle ships in a keepsake box", facts)).toHaveLength(1);
    expect(findUnsupportedClaims("Arrives in gift-ready packaging", facts)).toHaveLength(0);
  });

  it("certifications and ratings the business never claims → unsupported", async () => {
    await load();
    expect(findUnsupportedClaims("All-natural wax, phthalate-free fragrance", facts)).toHaveLength(2);
    expect(findUnsupportedClaims("Rated 4.9 stars by customers", facts).length).toBeGreaterThan(0);
  });

  it("a discount no active code gives → unsupported", async () => {
    await load();
    expect(findUnsupportedClaims("Get 20% off today", facts)).toHaveLength(1);
    const withCode = { ...facts, offers: [{ code: "DIWALI20", label: "20% off", percent: 20, flat: null }] };
    expect(findUnsupportedClaims("Get 20% off today", withCode)).toHaveLength(0);
  });

  it("ordinary copywriting advice passes untouched", async () => {
    await load();
    expect(findUnsupportedClaims("Lead with the hand-poured soy wax story and move 'Shop the Collection' above the fold", facts)).toEqual([]);
  });
});

describe("the live-audit output, run through the real CRO agent", () => {
  function anthropic(output: unknown) {
    const prompts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: any) => {
      prompts.push(JSON.parse(init.body).messages[0].content);
      return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ text: JSON.stringify(output) }] }) };
    }));
    return prompts;
  }

  it("drops every fabricated suggestion, keeps the honest ones, and says what it removed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const facts = await gatherCroFacts(db(CANDLE), "d1");
    const prompts = anthropic(LIVE_AUDIT_OUTPUT);
    const r = await generateCroSuggestions("landing_page", facts);

    const kept = JSON.stringify(r.output.suggestions);
    expect(kept).not.toMatch(/500\+|keepsake|Free shipping|Phthalate|All-natural/i);
    expect(r.output.suggestions).toHaveLength(2);
    expect(r.output.note).toMatch(/Removed suggestions that relied on details Hawlai couldn't verify/);

    // And the model was given the real site, not "(not set)", plus the rules.
    expect(prompts[0]).toContain('"A mood, not just a candle."');
    expect(prompts[0]).not.toContain("(not set)");
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
  });

  it("scrubbing leaves clean output alone, with no note", async () => {
    const facts = await gatherCroFacts(db(CANDLE), "d1");
    const clean = { suggestions: [LIVE_AUDIT_OUTPUT.suggestions[1]] };
    expect(scrubCroOutput(clean, facts)).toEqual({ output: clean, removed: [] });
  });
});

describe("the Page Health Check looks at the live site", () => {
  it("a published site with a headline is not told 'No landing page' or 'No headline set'", async () => {
    const report = await analyzeCro(db(CANDLE), "d1");
    const text = JSON.stringify(report.suggestions);
    expect(text).not.toMatch(/No landing page set up yet/);
    expect(text).not.toMatch(/No headline/);
    // What IS missing on the live site is still reported.
    expect(text).toMatch(/Share image/);
  });

  it("a business with no website at all still gets the landing-page check", async () => {
    const report = await analyzeCro(db({ ...CANDLE, websites: [], website_pages: [] }), "d1");
    expect(JSON.stringify(report.suggestions)).toMatch(/No landing page set up yet/);
  });
});
