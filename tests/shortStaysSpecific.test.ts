// A short piece still uses the owner's story (2026-09-20).
//
// THE LIVE CASE: "Candle Making Workshop ke liye ek chhota, punchy caption
// banao" came back as "Wax pighlaao, fragrance chunno, apne haathon se
// banao. 90 minutes. Ek candle jo tumhari apni hai. Workshop ₹800 mein —
// link in bio se book karo." True, nothing invented, and any candle
// workshop in India could have posted it. The same business's lavender
// caption, asked for without "chhota, punchy", used the owner's story
// properly — so brevity was being paid for with specificity.
//
// Now: the prompt says short compresses the detail rather than dropping
// it; a draft that echoes nothing of the story is retried once at the same
// length; and if it still comes back generic the owner is told.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

import { storyVocabulary, usesOwnStory, textOfOutput, storyForRetry, GENERIC_NOTE } from "@/lib/content/storyEcho";
import { craftSection, generateContent } from "@/lib/agents/contentMarketingAgent";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const STORY = [
  { category: "business_story", title: "The mistake I learnt from", content: "Temperature timing sabse mushkil step hai — ek baar jaldi mein poora batch kharab kiya tha." },
  { category: "business_story", title: "What I refuse to do", content: "Paraffin wax kabhi nahi — sirf soy wax, Kanpur ke supplier se." },
  // Shares "workshop" with the catalogue, and "khushboo" with nothing.
  { category: "business_story", title: "How the workshop runs", content: "Workshop mein har koi khushboo khud chunta hai." },
];

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products", "services"], inferred: false },
    city: "Shahjahanpur",
    site: null,
    home: null,
    products: [
      { id: "p1", name: "Candle Making Workshop", kind: "service", price: 800, duration_minutes: 90, description: "Hands-on soy wax candle making, 90 minutes", images: [], inventory: null, category: null, active: true },
    ],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 3, leads: 1 },
    ownerFacts: STORY,
    brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: null, products: [], booking: null },
    season: { today: "2026-09-20", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
    ...over,
  } as BusinessFacts;
}

/** The caption the owner actually got. */
const GENERIC = { text: "Wax pighlaao, fragrance chunno, apne haathon se banao. 90 minutes. Ek candle jo tumhari apni hai. Workshop ₹800 mein — link in bio se book karo." };
/** The same length, with the real mistake compressed into a phrase. */
const SPECIFIC = { text: "Pighlaao, khushboo chuno, dhaalo — 90 minute mein apni pehli candle. Temperature ka sabr hum sikha denge: ek poora batch kharab karke seekha tha. ₹800, link in bio." };

describe("what counts as using the owner's story", () => {
  it("the price and the duration don't — every workshop has those", () => {
    const vocabulary = storyVocabulary(facts());
    expect(vocabulary.has("90")).toBe(false);
    expect(vocabulary.has("800")).toBe(false);
    expect(vocabulary.has("candle")).toBe(false);
    // A word the catalogue also uses is nobody's story, however long it is.
    expect(vocabulary.has("workshop")).toBe(false);
    expect(vocabulary.has("khushboo")).toBe(true);
    expect(vocabulary.has("batch")).toBe(true);
    expect(vocabulary.has("paraffin")).toBe(true);
    expect(vocabulary.has("kanpur")).toBe(true);
  });

  it("the caption the owner got fails; the compressed one passes", () => {
    expect(usesOwnStory(GENERIC, facts())).toBe(false);
    expect(usesOwnStory(SPECIFIC, facts())).toBe(true);
  });

  it("a business with no story written down can't fail the check", () => {
    expect(usesOwnStory(GENERIC, facts({ ownerFacts: [] }))).toBe(true);
    expect(storyVocabulary(facts({ ownerFacts: [] })).size).toBe(0);
  });

  it("every shape a piece comes back in is read — and Hawlai's own notes aren't", () => {
    expect(textOfOutput({ slides: [{ headline: "Paraffin nahi", line: "Sirf soy." }] })).toContain("Paraffin");
    expect(textOfOutput({ days: [{ caption: "Kanpur ke supplier se" }] })).toContain("Kanpur");
    expect(textOfOutput({ text: "x", _claimsNote: "paraffin batch kharab" })).not.toContain("paraffin");
    expect(usesOwnStory({ text: "generic", _storyNote: GENERIC_NOTE }, facts())).toBe(false);
  });

  it("the retry is given the owner's own story, not a summary", () => {
    expect(storyForRetry(facts())).toEqual([
      "The mistake I learnt from: Temperature timing sabse mushkil step hai — ek baar jaldi mein poora batch kharab kiya tha.",
      "What I refuse to do: Paraffin wax kabhi nahi — sirf soy wax, Kanpur ke supplier se.",
      "How the workshop runs: Workshop mein har koi khushboo khud chunta hai.",
    ]);
  });
});

describe("the prompt tells it what short means", () => {
  it("brevity cuts everything else first, and compresses the detail", () => {
    const section = craftSection("Candle Making Workshop ke liye chhota punchy caption", [], true);
    expect(section).toContain("SHORT DOES NOT MEAN GENERIC");
    expect(section).toContain("the specific detail stays; everything else gets cut first");
    expect(section).toContain("Compress it into a phrase instead of spending a sentence on it");
  });
});

// ---- the generator, end to end -------------------------------------------
let replies: any[];
let prompts: string[];
function anthropic(...outputs: any[]) {
  replies = [...outputs];
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const next = replies.shift() ?? { text: "nothing left" };
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(next) }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
  }));
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a generic draft is retried once, at the same length", () => {
  const ask = (f = facts()) => generateContent("instagram_post", "Candle by Qaaf", "Home fragrance", "Candle Making Workshop ke liye ek chhota, punchy caption", null, undefined, undefined, f, "draft");

  it("the retry gets the owner's story and the format's rules — and its answer is kept", async () => {
    anthropic(GENERIC, SPECIFIC);
    const r = await ask();
    expect(r.output.text).toBe(SPECIFIC.text);
    expect(r.output._storyNote).toBeUndefined();
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("uses nothing that belongs to this business");
    expect(prompts[1]).toContain("poora batch kharab kiya tha");
    expect(prompts[1]).toContain("the same length");
    expect(prompts[1]).toContain("under 150 words"); // the format's own rules
  });

  it("a first draft that already uses the story is left alone — no second call", async () => {
    anthropic(SPECIFIC);
    const r = await ask();
    expect(r.output.text).toBe(SPECIFIC.text);
    expect(prompts).toHaveLength(1);
  });

  it("still generic after the retry: the owner is told, not quietly shipped", async () => {
    anthropic(GENERIC, { text: "Wax melt karo, candle banao. ₹800. Link in bio." });
    const r = await ask();
    expect(r.output._storyNote).toBe(GENERIC_NOTE);
    expect(prompts).toHaveLength(2);
  });

  it("a business with no story is never retried", async () => {
    anthropic(GENERIC);
    const r = await ask(facts({ ownerFacts: [] }));
    expect(prompts).toHaveLength(1);
    expect(r.output._storyNote).toBeUndefined();
  });

  it("a retry that comes back the wrong shape is ignored, and the owner is told", async () => {
    anthropic(GENERIC, { somethingElse: "not a caption" });
    const r = await ask();
    expect(r.output.text).toBe(GENERIC.text);
    expect(r.output._storyNote).toBe(GENERIC_NOTE);
  });
});

describe("chat asks the same way the page does", () => {
  it("the chat tool passes the last few pieces, so captions don't repeat each other", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toContain("{ recent: await recentCopy(supabase, ctx.id) }");
  });

  it("the note reaches the person reading it", () => {
    const panel = readFileSync("src/components/shared/GeneratedOutputPanel.tsx", "utf8");
    expect(panel).toContain("output?._storyNote");
  });
});
