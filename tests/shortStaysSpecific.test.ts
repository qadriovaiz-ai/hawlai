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
//
// THE SECOND SLIP-THROUGH: "Khud banao. Khud le jaao. Soy wax, apni pasand
// ki fragrance, 90 minutes — aur ek candle jo tumne apne haathon se dhaali
// hai" passed the first version of the check on "sirf", "khud", "haathon"
// — and on "work", taken from the TITLE of a story answer ("How we work"),
// which is Hawlai's own question label. Both captions are fixtures here.

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
  // The generic sentence every handmade business has — and the title is a
  // Hawlai question label, which is why neither may count on its own.
  { category: "business_story", title: "How we work", content: "Har candle apne haathon se dhaalte hain." },
  { category: "business_story", title: "Curing", content: "Har candle 24 ghante cure hoti hai — jaldi nikaali to surface kharab." },
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
/** The second caption the owner got — generic again, and it passed the first check. */
const GENERIC_TWO = { text: "Khud banao. Khud le jaao. Soy wax, apni pasand ki fragrance, 90 minutes — aur ek candle jo tumne apne haathon se dhaali hai. Workshop sirf ₹800 mein. Book karo — link in bio." };
/** The same length, with the real mistake compressed into a phrase. */
const SPECIFIC = { text: "Pighlaao, khushboo chuno, dhaalo — 90 minute mein apni pehli candle. Temperature ka sabr hum sikha denge: ek poora batch kharab karke seekha tha. ₹800, link in bio." };

describe("what counts as using the owner's story", () => {
  it("the price and the duration don't — every workshop has those", () => {
    const { strong, ordinary } = storyVocabulary(facts());
    const all = new Set([...strong, ...ordinary]);
    expect(all.has("90")).toBe(false);
    expect(all.has("800")).toBe(false);
    expect(all.has("candle")).toBe(false);
    // A word the catalogue also uses is nobody's story, however long it is.
    expect(all.has("workshop")).toBe(false);
    expect(all.has("khushboo")).toBe(true);
    expect(all.has("batch")).toBe(true);
    expect(all.has("paraffin")).toBe(true);
    // A number the owner gave, and a name they typed, carry the story alone.
    expect(strong.has("24")).toBe(true);
    expect(strong.has("kanpur")).toBe(true);
  });

  it("a story answer's TITLE is Hawlai's question, not the owner's words", () => {
    const { strong, ordinary } = storyVocabulary(facts());
    // "How we work", "The mistake I learnt from", "Curing" — all labels.
    for (const w of ["work", "mistake", "learnt", "curing", "refuse"]) {
      expect(strong.has(w)).toBe(false);
      expect(ordinary.has(w)).toBe(false);
    }
  });

  it("both captions the owner was actually given fail; the compressed one passes", () => {
    expect(usesOwnStory(GENERIC, facts())).toBe(false);
    // The second slip-through: shares only everyday words with the story.
    expect(usesOwnStory(GENERIC_TWO, facts())).toBe(false);
    expect(usesOwnStory(SPECIFIC, facts())).toBe(true);
  });

  it("one everyday word is not an echo; two, or one number or name, is", () => {
    // "haathon" alone — the word every handmade business uses.
    expect(usesOwnStory({ text: "Apne haathon se banayi hui candle." }, facts())).toBe(false);
    // Two of the owner's own words.
    expect(usesOwnStory({ text: "Temperature ka sabr — ek poora batch kharab karke seekha." }, facts())).toBe(true);
    // One number they gave.
    expect(usesOwnStory({ text: "24 ghante ka sabr, phir hi ghar jaati hai." }, facts())).toBe(true);
    // One name they typed.
    expect(usesOwnStory({ text: "Kanpur ke supplier se aaya wax." }, facts())).toBe(true);
    // Exactly ONE of the owner's ordinary words is still not an echo.
    expect(usesOwnStory({ text: "Khushboo khud chuno, aur ghar le jao." }, facts())).toBe(false);
    // A word that merely STARTS one of their sentences is ordinary, not a name.
    expect(usesOwnStory({ text: "Paraffin nahi, bas." }, facts())).toBe(false);
  });

  it("a business with no story written down can't fail the check", () => {
    expect(usesOwnStory(GENERIC, facts({ ownerFacts: [] }))).toBe(true);
    const empty = storyVocabulary(facts({ ownerFacts: [] }));
    expect(empty.strong.size + empty.ordinary.size).toBe(0);
  });

  it("every shape a piece comes back in is read — and Hawlai's own notes aren't", () => {
    expect(textOfOutput({ slides: [{ headline: "Paraffin nahi", line: "Sirf soy." }] })).toContain("Paraffin");
    expect(textOfOutput({ days: [{ caption: "Kanpur ke supplier se" }] })).toContain("Kanpur");
    expect(textOfOutput({ text: "x", _claimsNote: "paraffin batch kharab" })).not.toContain("paraffin");
    expect(usesOwnStory({ text: "generic", _storyNote: GENERIC_NOTE }, facts())).toBe(false);
  });

  it("the retry is given the owner's own story, not a summary", () => {
    expect(storyForRetry(facts(), 2)).toEqual([
      "The mistake I learnt from: Temperature timing sabse mushkil step hai — ek baar jaldi mein poora batch kharab kiya tha.",
      "What I refuse to do: Paraffin wax kabhi nahi — sirf soy wax, Kanpur ke supplier se.",
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

  it("the second caption the owner got is retried too, not passed as specific", async () => {
    anthropic(GENERIC_TWO, SPECIFIC);
    const r = await ask();
    expect(prompts).toHaveLength(2);
    expect(r.output.text).toBe(SPECIFIC.text);
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

  it("the note reaches the person reading it — on the page AND on a chat card", () => {
    const panel = readFileSync("src/components/shared/GeneratedOutputPanel.tsx", "utf8");
    expect(panel).toContain("output?._storyNote");
    // The chat card dropped it: a generic caption arrived with no note at all.
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toContain("artifact.storyNote = result._storyNote;");
    const chat = readFileSync("src/components/chat/MasterChatPage.tsx", "utf8");
    expect(chat).toContain("const storyWarning = artifact.storyNote ?");
    expect(chat).toContain("{storyWarning}");
  });
});
