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
import { isGeneric } from "@/lib/content/antiGeneric";
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
  // THE INVERSION (2026-10-09). Every test in this block used to assert
  // that a draft missing the owner's STORY was retried toward it. The
  // mechanism asserted here is unchanged — one retry, the retry's answer
  // kept even when it still fails, the owner told either way, and no
  // retry for a business with nothing to retry toward. Only the TARGET
  // moved, from the founder's backstory to a recorded product specific
  // (docs/PRINCIPLES.md P1).
  //
  // The two captions the owner actually received stay as fixtures, and
  // they are why this block is worth keeping: whatever the rule is,
  // those two must be caught.
  // `revise: true` added 2026-10-09. The specificity retry is gated
  // behind it now, honouring the "auto-publish path stays single-shot"
  // contract in contentQuality.test.ts. These tests are ABOUT the retry,
  // so they ask on a reviewed path - which is the only path it runs on.
  const ask = (f = facts()) => generateContent("instagram_post", "Candle by Qaaf", "Home fragrance", "Candle Making Workshop ke liye ek chhota, punchy caption", null, undefined, undefined, f, "draft", { revise: true });

  it("the retry gets a recorded specific and the format's rules — and its answer is kept", async () => {
    // BEFORE: asserted the prompt contained "uses nothing that belongs
    // to this business" and a story answer ("poora batch kharab kiya
    // tha").
    // AFTER: the prompt names the business's own catalogue instead. The
    // length and format-rule assertions are UNTOUCHED — they are what
    // stop the retry becoming a fresh generation that drifts off topic.
    // THREE replies, because the reviewed path is draft -> revise ->
    // specificity retry. The revise pass hands back a still-generic
    // caption so the retry is the thing under test.
    anthropic(GENERIC, GENERIC, SPECIFIC);
    const r = await ask();
    expect(r.output.text).toBe(SPECIFIC.text);
    expect(r.output._storyNote).toBeUndefined();
    expect(prompts).toHaveLength(3);
    const retry = prompts[2];
    expect(retry).toContain("could have been published by any business");
    expect(retry).toContain("Candle Making Workshop");
    expect(retry).toContain("the same length");
    expect(retry).toContain("under 150 words"); // the format's own rules
    // AND THE NEW RULE, stated: the retry must not be told to reach for
    // the owner's personal history.
    expect(retry).toContain("Do NOT reach for the owner's personal history");
  });

  it("a first draft that already carries a specific is left alone — no second call", async () => {
    // BEFORE: "already uses the story". AFTER: already carries a
    // recorded specific. Intent identical — one retry costs money, so
    // do not retry what passed.
    anthropic(SPECIFIC, SPECIFIC);
    const r = await ask();
    expect(r.output.text).toBe(SPECIFIC.text);
    // Two, not three: the revise pass runs (it is opt-in and asked for
    // here), the specificity RETRY does not, because nothing was wrong.
    expect(prompts).toHaveLength(2);
  });

  it("still generic after the retry: the owner is told, not quietly shipped", async () => {
    // BEFORE: expected the note to equal GENERIC_NOTE exactly.
    // AFTER: stronger — the note must NAME something to add, and must
    // not ask for the founder's story (P1).
    const stillGeneric = { text: "Wax melt karo, candle banao. Link in bio." };
    anthropic(GENERIC, GENERIC, stillGeneric);
    const r = await ask();
    // THE RETRY'S ANSWER IS KEPT EVEN THOUGH IT STILL FAILED. A
    // mutation check found this unpinned: deleting the line that keeps
    // it left the original draft in place and nothing noticed. The
    // choice is deliberate - a second attempt is not worse than the
    // first, and the owner is told either way - so it is asserted.
    expect(r.output.text).toBe(stillGeneric.text);
    expect(r.output._storyNote).toBeTruthy();
    expect(r.output._storyNote).toMatch(/any business in your line of work/);
    expect(r.output._storyNote).toMatch(/Add /);
    expect(r.output._storyNote).not.toMatch(/story/i);
    expect(prompts).toHaveLength(3);
  });

  it("the second caption the owner got is retried too, not passed as specific", async () => {
    // Unchanged in substance. Both real captions must be caught by
    // whatever the rule is, and this is the one that slipped through the
    // FIRST version of the story check in September.
    anthropic(GENERIC_TWO, GENERIC_TWO, SPECIFIC);
    const r = await ask();
    expect(prompts).toHaveLength(3);
    expect(r.output.text).toBe(SPECIFIC.text);
  });

  it("A REAL PRICE IN THE DRAFT IS NOT ENOUGH TO SKIP THE RETRY", () => {
    // New, and it is the correction storyEcho's header had already
    // written down: "the price (₹800) and the duration (90 minutes) come
    // from the catalogue — every competitor has those too, and counting
    // them would have passed the very caption that started this."
    //
    // GENERIC contains ₹800, this workshop's real price. My first
    // version of the specific rule counted that as sufficient and would
    // have passed this caption.
    expect(GENERIC.text).toContain("₹800");
    expect(isGeneric(GENERIC, facts(), "hinglish").generic).toBe(true);
  });

  it("a business with nothing recorded is never retried", async () => {
    // BEFORE: "no story". AFTER: nothing recorded at all — no products
    // and no notes, so there is nothing to retry toward and a second
    // model call would produce the same words.
    anthropic(GENERIC, GENERIC);
    const r = await ask(facts({ ownerFacts: [], products: [], offers: [], city: null }));
    // The revise pass still runs; the specificity retry does not, because
    // there is nothing to retry toward.
    expect(prompts).toHaveLength(2);
    expect(r.output._storyNote).toBeUndefined();
  });

  it("a retry that comes back the wrong shape is ignored, and the owner is told", async () => {
    // Unchanged: a bad second call must not silently replace a good
    // first one.
    anthropic(GENERIC, GENERIC, { somethingElse: "not a caption" });
    const r = await ask();
    expect(r.output.text).toBe(GENERIC.text);
    expect(r.output._storyNote).toBeTruthy();
  });
});
describe("chat asks the same way the page does", () => {
  it("the chat tool passes the last few pieces, so captions don't repeat each other", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    // The braces came off on 2026-10-09 when `revise: true` joined it in
    // the same opts object (F-Q1). The fact this test exists for is
    // unchanged: the chat tool passes the last few pieces.
    expect(brain).toContain("recent: await recentCopy(supabase, ctx.id)");
    // And it is still the generate_content opts it goes into, not some
    // other call that happens to mention recentCopy.
    expect(brain).toMatch(/generate_content[\s\S]{0,4000}recent: await recentCopy\(supabase, ctx\.id\)/);
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
