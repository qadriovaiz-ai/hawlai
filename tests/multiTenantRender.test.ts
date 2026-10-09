// THE EXECUTION HALF: run three different businesses through the same
// paths and check that none of them is handed another one's words.
//
// tests/multiTenantVocabulary.test.ts greps the source. A grep cannot
// catch the failure that actually happened: a sweet shop asking for a
// Reel script and being handed "Wide shot of the car in the showroom",
// because that string lived in a fallback the grep would have called a
// legitimate default. So this file RUNS the generators, with the model
// failing, which is exactly when a fallback decides what the owner sees.
//
// Three categories, deliberately unlike each other:
//   - a sweet shop      physical product, shipped, festival-driven
//   - a coaching centre service, booked, nothing to ship
//   - a candle shop     the business every incident this year happened
//                       on, included so its words cannot leak OUT of it
//
// The assertion is symmetric: no output for one business may contain a
// word belonging to either of the other two.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------
// Three businesses.
// ---------------------------------------------------------------------

type Biz = {
  id: string;
  key: "sweets" | "coaching" | "candles";
  name: string;
  category: string;
  city: string;
  product: { name: string; price: number; description: string; kind?: "service" };
  /** Words that belong to THIS business and must never appear for another. */
  ownWords: RegExp[];
};

const BUSINESSES: Biz[] = [
  {
    id: "d-sweets",
    key: "sweets",
    name: "Gupta Sweets",
    category: "Sweet shop",
    city: "Kanpur",
    product: { name: "Kaju katli box", price: 650, description: "Half a kilo, made with pure khoya" },
    ownWords: [/kaju/i, /katli/i, /khoya/i, /mithai/i, /sweets?\b/i, /Gupta/i],
  },
  {
    id: "d-coaching",
    key: "coaching",
    name: "Sharma Classes",
    category: "Coaching centre",
    city: "Jaipur",
    product: { name: "Class 10 maths batch", price: 2400, description: "Three evenings a week, 12 students a batch", kind: "service" },
    ownWords: [/maths?\b/i, /batch/i, /tuition/i, /Sharma/i, /coaching/i],
  },
  {
    id: "d-candles",
    key: "candles",
    name: "Qaaf Home",
    category: "Home fragrance",
    city: "Lucknow",
    product: { name: "Lavender candle", price: 550, description: "Hand-poured soy wax" },
    ownWords: [/candles?\b/i, /lavender/i, /soy/i, /wax/i, /Qaaf/i],
  },
];

/** Words from the car-dealership era: never acceptable for anyone. */
const DEALERSHIP_WORDS = [
  /test[ _-]?drive/i,
  /test[ _-]?ride/i,
  /showroom/i,
  /\bcar\b/i,
  /\bvehicle/i,
  /dealership/i,
  /Our Dealership/i,
];

function foreignWords(self: Biz): RegExp[] {
  return [...BUSINESSES.filter((b) => b.key !== self.key).flatMap((b) => b.ownWords), ...DEALERSHIP_WORDS];
}

/** Every assertion in this file, in one place. */
function assertNoForeignWords(self: Biz, label: string, text: string) {
  for (const pattern of foreignWords(self)) {
    expect(text, `${label} for ${self.name} (${self.category}) contained ${pattern}`).not.toMatch(pattern);
  }
}

// ---------------------------------------------------------------------
// One fake database, switched between the three.
// ---------------------------------------------------------------------

let current: Biz = BUSINESSES[0];

function rowsFor(b: Biz): Record<string, any[]> {
  return {
    dealerships: [{ id: b.id, dealership_name: b.name, business_category: b.category, city: b.city }],
    websites: [{ id: "w1", dealership_id: b.id, slug: "shop", published: true, shipping_mode: "flat", shipping_rate: 60 }],
    website_pages: [],
    products: [
      {
        id: "p1",
        dealership_id: b.id,
        name: b.product.name,
        price: b.product.price,
        description: b.product.description,
        ...(b.product.kind ? { kind: b.product.kind } : {}),
        images: [],
        is_active: true,
        order_index: 0,
      },
    ],
    brand_profiles: [{ dealership_id: b.id, tone_of_voice: "warm", messaging_pillars: [], preferred_language: "english" }],
    discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
    business_knowledge: [], business_memory: [], team_members: [], content_pieces: [],
  };
}

function db() {
  const tables = rowsFor(current);
  const from = (table: string) => {
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api,
      not: () => api, is: () => api, in: () => api, ilike: () => api, insert: () => api, update: () => api,
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));

import { generateLandingPageCopy } from "@/lib/agents/websiteAgent";
import { generateVideoScript, generateCopyVariations } from "@/lib/agents/creativeAgent";
import { gatherBusinessFacts, factsPrompt } from "@/lib/claims/businessFacts";

/** THE MODEL IS DOWN. This is when a fallback decides what the owner sees. */
function modelDown() {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false,
    status: 529,
    text: async () => JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }),
    json: async () => ({ error: { type: "overloaded_error", message: "overloaded" } }),
    headers: { get: () => null },
  })));
}

/** The model answers, in this business's own words. */
function modelSays(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => {
    const content = [{ type: "text", text: JSON.stringify(payload) }];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ content }),
      json: async () => ({ content }),
      headers: { get: () => null },
    };
  }));
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------
// 1. Website fallback.
// ---------------------------------------------------------------------

describe("website copy, model down", () => {
  for (const biz of BUSINESSES) {
    it(`${biz.category}: the fallback names the business and claims nothing`, async () => {
      current = biz;
      modelDown();
      const copy = await generateLandingPageCopy(biz.name, biz.city, { tone_of_voice: "warm" }, biz.category);

      const all = `${copy.headline} ${copy.subheadline} ${copy.offer_text}`;
      assertNoForeignWords(biz, "website fallback", all);
      // The name and the city are facts. Everything else is empty
      // rather than invented — was "Your Trusted Car Partner".
      expect(copy.headline).toContain(biz.name);
      expect(copy.subheadline).toBe("");
      expect(copy.offer_text).toBe("");
      // And no claim or offer anywhere.
      expect(all).not.toMatch(/best|trusted|free|guarantee|hurry|limited/i);
    });
  }
});

// ---------------------------------------------------------------------
// 2. Video script fallback.
// ---------------------------------------------------------------------

describe("video script, model down", () => {
  for (const biz of BUSINESSES) {
    it(`${biz.category}: no scenes rather than another trade's storyboard`, async () => {
      current = biz;
      modelDown();
      const script = await generateVideoScript(`a reel about ${biz.product.name}`, { tone_of_voice: "warm" }, biz.category);

      const all = `${script.title} ${script.scenes.map((s) => `${s.visual} ${s.voiceover_or_caption}`).join(" ")}`;
      assertNoForeignWords(biz, "video fallback", all);
      // THE REGRESSION THIS PINS: a sweet shop used to receive
      // "Wide shot of the car in the showroom" / "Book your test
      // drive today!" as a complete, plausible-looking script.
      expect(script.scenes).toEqual([]);
      expect(script.fallbackReason).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------
// 3. Ad copy fallback.
// ---------------------------------------------------------------------

describe("ad copy variations, model down", () => {
  for (const biz of BUSINESSES) {
    it(`${biz.category}: nothing, rather than invented urgency`, async () => {
      current = biz;
      modelDown();
      const variations = await generateCopyVariations(biz.product.name, { tone_of_voice: "warm" }, 3, biz.category);

      assertNoForeignWords(biz, "ad fallback", JSON.stringify(variations));
      // Was one hand-written variation: "Limited Stock! Hurry, offer
      // ends soon. Book your test drive today." — a stock claim, an
      // offer and the wrong trade, on a path the guard never saw.
      expect(variations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------
// 4. The facts block each business's prompts actually carry.
// ---------------------------------------------------------------------

describe("the facts prompt is this business's own", () => {
  for (const biz of BUSINESSES) {
    it(`${biz.category}: names its own product and no other trade's`, async () => {
      current = biz;
      const facts = await gatherBusinessFacts(db(), biz.id);
      const block = factsPrompt(facts);

      expect(block).toContain(biz.product.name);
      expect(block).toContain(biz.name);
      assertNoForeignWords(biz, "facts prompt", block);
    });
  }
});

// ---------------------------------------------------------------------
// 5. A real model answer passes through unchanged and uncontaminated.
// ---------------------------------------------------------------------

describe("website copy, model answering", () => {
  for (const biz of BUSINESSES) {
    it(`${biz.category}: the business's own words survive`, async () => {
      current = biz;
      modelSays({
        headline: `${biz.product.name} at ${biz.name}`,
        subheadline: biz.product.description,
        offer_text: "Get in touch",
      });
      const copy = await generateLandingPageCopy(biz.name, biz.city, { tone_of_voice: "warm" }, biz.category);
      const all = `${copy.headline} ${copy.subheadline} ${copy.offer_text}`;

      expect(copy.headline).toContain(biz.product.name);
      assertNoForeignWords(biz, "website copy", all);
    });
  }
});
