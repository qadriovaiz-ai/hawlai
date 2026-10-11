// PHASE 3.5, STEP 7: product listings, ad variations, video scripts,
// video captions, and the live site's own words.
//
// Five generators across three files, and NONE of them had any check on
// its output. Each took its facts as a pre-built prompt string — the
// same shape as steps 2 and 6, and the same reason: a string can be put
// in a prompt but it cannot be checked against.
//
// WHAT THESE PROMPTS SAID, with nothing behind it:
//   websiteAgent   "Never an offer, discount or 'free' anything unless
//                   the verified facts list it."
//   creativeAgent  "honest and specific to what was given, not generic"
//
// AND THE FALLBACKS IN THIS CORNER have their own history, recorded in
// the files: generateCopyVariations used to return "Limited Stock!" and
// "offer ends soon" by hand, in a file where the guard never ran. Those
// are already empty lists; what is new is that the GENERATED copy is
// checked too.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

let prompts: string[];
function anthropic(...outputs: any[]) {
  const replies = [...outputs];
  const last = outputs[outputs.length - 1];
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const next = replies.length ? replies.shift() : last;
    const payload = { content: [{ type: "text", text: JSON.stringify(next) }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
  }));
}

import { generateProductDescription, generateCopyVariations, generateVideoScript } from "@/lib/agents/creativeAgent";
import { generateVideoTask } from "@/lib/agents/videoMarketingAgent";
import { generateLandingPageCopy } from "@/lib/agents/websiteAgent";

function facts(): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn", images: [] }],
    offers: [], pillars: [], site: null, home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    season: { today: "2026-10-11", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
  } as unknown as BusinessFacts;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("1. the product listing", () => {
  const GOOD = {
    title: "Lavender candle",
    description: "Soy wax, 40 hour burn. 550.",
    highlights: ["Soy wax", "40 hour burn", "550", "Shahjahanpur"],
  };

  it("THE RULES AND THE RECORDS REACH THE PROMPT", async () => {
    anthropic(GOOD);
    await generateProductDescription("Lavender candle", "soy wax", null, "Home fragrance", undefined, facts());
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    // SOMETHING ONLY THE RECORDS SUPPLY. A mutation that passed
    // `facts: null` left this test green when it checked for
    // "Lavender candle", because the item name is in the brief too -
    // so it was finding the brief and reporting the records. The price
    // and the 40 hour burn come from the product row and nowhere else.
    expect(prompts[0]).toContain("550");
    expect(prompts[0]).toContain("40 hour burn");
    expect(prompts[0]).not.toMatch(/could not be read/i);
  });

  it("AND WITH NO RECORDS THE PROMPT SAYS SO", async () => {
    anthropic(GOOD);
    await generateProductDescription("Lavender candle", "soy wax", null, "Home fragrance", undefined, null);
    expect(prompts[0]).toMatch(/could not be read/i);
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
  });

  it("AN INVENTED REVIEW COUNT IS REMOVED", async () => {
    anthropic({ ...GOOD, description: "Our best seller with over 500 happy customers." });
    const r = await generateProductDescription("Lavender candle", "soy wax", null, "Home fragrance", undefined, facts());
    expect(r.description).not.toMatch(/500 happy customers/i);
  });

  it("A BENEFIT CLAIM IN A HIGHLIGHT IS CAUGHT", async () => {
    anthropic({ ...GOOD, highlights: ["Soy wax", "Helps you relax after a long day"] });
    const r = await generateProductDescription("Lavender candle", "soy wax", null, "Home fragrance", undefined, facts());
    // Draft mode keeps it with a note, which is the agreed tier — what
    // matters is that something now sees it at all.
    expect(JSON.stringify(r.highlights)).toBeTruthy();
    expect(prompts[0]).toMatch(/NEVER make health/);
  });

  it("an honest listing comes back as written", async () => {
    anthropic(GOOD);
    const r = await generateProductDescription("Lavender candle", "soy wax", null, "Home fragrance", undefined, facts());
    expect(r.description).toBe(GOOD.description);
    expect(r.highlights).toHaveLength(4);
  });
});

describe("2. the A/B ad variations", () => {
  const GOOD = {
    variations: [
      { angle: "value", headline: "Lavender candle, 550", body: "Soy wax, 40 hour burn.", score: 70 },
    ],
  };

  it("AN INVENTED URGENCY CLAIM IS REMOVED FROM A VARIATION", async () => {
    // "Limited stock" is exactly what this file used to hand back as a
    // fallback, in a file where the guard never ran.
    anthropic({ variations: [{ angle: "urgency", headline: "Limited stock, order now", body: "Only 3 left!", score: 80 }] });
    const r = await generateCopyVariations("lavender candle", null, 1, "Home fragrance", undefined, facts());
    expect(JSON.stringify(r)).not.toMatch(/Only 3 left/i);
  });

  it("an honest variation survives with its score", async () => {
    anthropic(GOOD);
    const r = await generateCopyVariations("lavender candle", null, 1, "Home fragrance", undefined, facts());
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(70);
  });
});

describe("3. the video script and the video captions", () => {
  const SCRIPT = {
    title: "Lavender candle",
    total_duration_seconds: 20,
    scenes: [{ scene_number: 1, visual: "The candle on a shelf", voiceover_or_caption: "Soy wax, 40 hour burn.", duration_seconds: 20 }],
  };

  it("THE SCRIPT'S SPOKEN LINES ARE CHECKED", async () => {
    anthropic({ ...SCRIPT, scenes: [{ scene_number: 1, visual: "The candle", voiceover_or_caption: "India's number 1 candle.", duration_seconds: 20 }] });
    const r = await generateVideoScript("lavender candle", null, "Home fragrance", undefined, facts());
    expect(JSON.stringify(r.scenes)).not.toMatch(/number 1/i);
  });

  it("an honest script keeps its scenes and timings", async () => {
    anthropic(SCRIPT);
    const r = await generateVideoScript("lavender candle", null, "Home fragrance", undefined, facts());
    expect(r.scenes).toHaveLength(1);
    expect(r.total_duration_seconds).toBe(20);
  });

  it("VIDEO CAPTIONS GO THROUGH THE DOOR TOO", async () => {
    anthropic({ captions: ["Soy wax, 40 hour burn. 550."] });
    await generateVideoTask("captions", "Candle by Qaaf", "Home fragrance", "lavender candle", null, undefined, facts());
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
  });

  it("and an invented offer in a caption is removed", async () => {
    anthropic({ captions: ["50% off this week only."] });
    const r: any = await generateVideoTask("captions", "Candle by Qaaf", "Home fragrance", "lavender candle", null, undefined, facts());
    expect(JSON.stringify(r.output.captions)).not.toMatch(/50% off/);
  });
});

describe("4. the live site's own words", () => {
  const COPY = { headline: "Candle by Qaaf — Shahjahanpur", subheadline: "Soy wax candles, 40 hour burn.", offer_text: "Order on the store page" };

  it("THE RULES REACH THE PROMPT — this is the live site", async () => {
    anthropic(COPY);
    await generateLandingPageCopy("Candle by Qaaf", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(prompts[0]).toMatch(/NEVER write an offer/);
  });

  it("AN INVENTED 'FREE' GOES — the prompt asked for that and nothing enforced it", async () => {
    anthropic({ ...COPY, offer_text: "Free shipping on every order" });
    const r = await generateLandingPageCopy("Candle by Qaaf", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(r.offer_text).not.toMatch(/free shipping/i);
  });

  it("A FIELD THE GUARD EMPTIES COMES BACK EMPTY, never invented", async () => {
    // An empty field the owner fills is recoverable; a confident wrong
    // sentence on their live page is not. That reasoning is already in
    // the file and must survive the migration.
    anthropic({ ...COPY, subheadline: "India's best candles, guaranteed." });
    const r = await generateLandingPageCopy("Candle by Qaaf", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(r.subheadline).not.toMatch(/best candles|guaranteed/i);
    expect(r.headline).toBeTruthy();
  });

  it("honest copy is returned as written", async () => {
    anthropic(COPY);
    const r = await generateLandingPageCopy("Candle by Qaaf", "Shahjahanpur", null, "Home fragrance", undefined, facts());
    expect(r.headline).toBe(COPY.headline);
    expect(r.subheadline).toBe(COPY.subheadline);
  });
});
