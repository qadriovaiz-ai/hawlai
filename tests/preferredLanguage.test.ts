// The owner's Preferred Ad Language is obeyed (2026-09-20).
//
// THE BUG: Settings → Brand was changed from Hinglish to English, saved,
// and chat kept writing Hinglish captions. The setting DID reach the
// prompt — as one line inside the facts, "Preferred language: english",
// while the ten Business Story answers were printed in full, in Hinglish.
// Nothing said which one the piece should follow.
//
// Now it's a rule, before the facts, in the words of an instruction: write
// every word in this language, and translate the owner's details into it
// rather than quoting them. The same rule reaches the retry and the
// revision pass, and the three other generators that carried the setting
// weakly (social) or not at all (email, WhatsApp).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

import { normaliseLanguage, languageRule, soundRule, looksHinglish } from "@/lib/content/language";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { usesOwnStory, ordinaryMatchesNeeded } from "@/lib/content/storyEcho";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const STORY = [
  { category: "business_story", title: "The mistake I learnt from", content: "Temperature timing sabse mushkil step hai — ek baar jaldi mein poora batch kharab kiya tha." },
  { category: "business_story", title: "Curing", content: "Har candle 24 ghante cure hoti hai, jaldi nahi." },
];

function facts(language: string | null, over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products", "services"], inferred: false },
    city: "Shahjahanpur", site: null, home: null,
    products: [{ id: "p1", name: "Candle Making Workshop", kind: "service", price: 800, duration_minutes: 90, description: "Hands-on candle making, 90 minutes", images: [], inventory: null, category: null, active: true }],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 3, leads: 1 },
    ownerFacts: STORY,
    brand: { tone: "warm", voice: null, persona: null, language, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: null, products: [], booking: null },
    season: { today: "2026-09-20", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
    ...over,
  } as BusinessFacts;
}

describe("the setting, read as a setting", () => {
  it("whatever it's stored as", () => {
    expect(normaliseLanguage("english")).toBe("english");
    expect(normaliseLanguage("English")).toBe("english");
    expect(normaliseLanguage("hindi")).toBe("hindi");
    // The product's own default, and anything unreadable.
    expect(normaliseLanguage("hinglish")).toBe("hinglish");
    expect(normaliseLanguage(null)).toBe("hinglish");
    expect(normaliseLanguage("")).toBe("hinglish");
  });

  it("English says what to do about notes kept in Hinglish", () => {
    const rule = languageRule("english");
    expect(rule).toContain("Write EVERY word of this piece in English");
    expect(rule).toContain("never carry their Hinglish phrasing across");
    expect(languageRule("hindi")).toContain("Devanagari");
    expect(languageRule("hinglish")).toContain("Roman script");
  });

  it("the tone is a setting too, and it beats how the owner's own notes sound", () => {
    const block = soundRule("english", "professional, no exclamation marks");
    expect(block).toContain("these are settings the owner chose");
    expect(block).toContain("Tone: professional, no exclamation marks");
    expect(block).toContain("the notes are a record, not a style guide");
    // No tone set: the language rule still stands on its own.
    expect(soundRule("english", null)).toContain("Write EVERY word");
    expect(soundRule("english", null)).not.toContain("Tone:");
  });
});

// ---- through the generator -------------------------------------------------
let prompts: string[];
function anthropic(...outputs: any[]) {
  const queue = [...outputs];
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const next = queue.shift() ?? { text: "nothing left" };
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(next) }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
  }));
}

const ENGLISH_CAPTION = { text: "Melt, choose your scent, pour. Ninety minutes, one candle that's yours — and no ruined batch, because we learnt that the hard way. ₹800, link in bio." };

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the workshop caption, with English selected", () => {
  const ask = (brand: any, f: BusinessFacts) =>
    generateContent("instagram_post", "Candle by Qaaf", "Home fragrance", "Candle Making Workshop ke liye ek chhota, punchy caption", brand, undefined, undefined, f, "draft");

  it("the brand profile's setting reaches the prompt as an instruction", async () => {
    anthropic(ENGLISH_CAPTION);
    await ask({ tone_of_voice: "warm", preferred_language: "english" }, facts("english"));
    expect(prompts[0]).toContain("Write EVERY word of this piece in English");
    expect(prompts[0]).toContain("these are settings the owner chose");
    // Above the facts, not buried in them.
    expect(prompts[0].indexOf("Write EVERY word")).toBeLessThan(prompts[0].indexOf("Content type: Instagram Post"));
  });

  it("chat has no brand row to pass, so the setting is read from the facts", async () => {
    anthropic(ENGLISH_CAPTION);
    await ask({ tone_of_voice: "warm", messaging_pillars: [], preferred_language: null }, facts("english"));
    expect(prompts[0]).toContain("Write EVERY word of this piece in English");
  });

  it("the setting just changed: the brand row wins over an older value in the facts", async () => {
    anthropic(ENGLISH_CAPTION);
    // Settings saved English; the facts still carry the old Hinglish.
    await ask({ tone_of_voice: "warm", preferred_language: "english" }, facts("hinglish"));
    expect(prompts[0]).toContain("Write EVERY word of this piece in English");
    expect(prompts[0]).not.toContain("natural Hinglish");
  });

  it("Hinglish stays Hinglish — the default isn't touched", async () => {
    anthropic({ text: "Khud dhaalo apni pehli candle." });
    await ask({ tone_of_voice: "warm", preferred_language: "hinglish" }, facts("hinglish"));
    expect(prompts[0]).toContain("natural Hinglish");
    expect(prompts[0]).not.toContain("Write EVERY word of this piece in English");
  });

  it("the Brand Voice block stops contradicting the setting (2026-09-21)", async () => {
    // Why English didn't hold even here: formatFactsForCopy prints the
    // Brand Voice block, whose hinglish_ok defaults to true — so the same
    // prompt carried "write naturally in Hinglish… don't force pure
    // English", under a heading telling the model to follow it exactly.
    anthropic(ENGLISH_CAPTION);
    const withVoice = facts("english", { brand: { tone: "warm", voice: null, persona: null, language: "english", pillars: [], description: null, colors: [], logoUrl: null } as any });
    await ask({ tone_of_voice: "warm", preferred_language: "english" }, withVoice);
    expect(prompts[0]).toContain("Write EVERY word of this piece in English");
    expect(prompts[0]).not.toContain("don't force pure English");
    expect(prompts[0]).toContain("set their copy language to English — that settles it");
  });

  it("the Content Marketing page's revision pass is in it too", async () => {
    // The page asks for a second, tightening pass; it used to be told to
    // "keep the same language", which would have locked in the wrong one.
    anthropic(ENGLISH_CAPTION, ENGLISH_CAPTION);
    await generateContent(
      "instagram_post", "Candle by Qaaf", "Home fragrance", "Workshop caption",
      { tone_of_voice: "warm", preferred_language: "english" }, undefined, undefined, facts("english"), "draft",
      { revise: true }
    );
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("ruthless copy editor");
    expect(prompts[1]).toContain("Write EVERY word of this piece in English");
  });

  it("the retry is in the owner's language too", async () => {
    // First draft: English but nothing of the story — so it's retried.
    anthropic({ text: "Make your own candle in 90 minutes. ₹800, link in bio." }, ENGLISH_CAPTION);
    const r = await ask({ tone_of_voice: "warm", preferred_language: "english" }, facts("english"));
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Write EVERY word of this piece in English");
    expect(r.output.text).toBe(ENGLISH_CAPTION.text);
  });
});

describe("a detail translated is still the owner's detail", () => {
  it("English from Hinglish notes needs one shared word, not two", () => {
    // The words themselves don't survive translation; demanding two would
    // call every honest English caption generic.
    expect(ordinaryMatchesNeeded(facts("english"), "english")).toBe(1);
    expect(ordinaryMatchesNeeded(facts("hinglish"), "hinglish")).toBe(2);
    expect(usesOwnStory(ENGLISH_CAPTION, facts("english"), "english")).toBe(true);
    // Still nothing of the story: still caught.
    expect(usesOwnStory({ text: "Make your own candle in 90 minutes. ₹800, link in bio." }, facts("english"), "english")).toBe(false);
  });

  it("which register the notes are in is read from the notes", () => {
    expect(looksHinglish("Temperature timing sabse mushkil step hai — ek baar jaldi mein poora batch kharab kiya tha.")).toBe(true);
    expect(looksHinglish("हर कैंडल 24 घंटे क्योर होती है")).toBe(true);
    expect(looksHinglish("We pour every candle by hand and let it cure for a full day.")).toBe(false);
  });
});

describe("every generator reads the same settings", () => {
  it("content, social, email and WhatsApp all carry the rule", () => {
    for (const file of [
      "src/lib/agents/contentMarketingAgent.ts",
      "src/lib/agents/socialMediaAgent.ts",
      "src/lib/agents/emailMarketingAgent.ts",
      "src/lib/agents/whatsappMarketingAgent.ts",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("soundRule(");
    }
  });

  it("both content paths pass the owner's setting", () => {
    const page = readFileSync("src/app/api/content-marketing/generate/route.ts", "utf8");
    expect(page).toContain('select("tone_of_voice, target_persona, messaging_pillars, preferred_language")');
    const chat = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(chat).toContain("preferred_language: facts?.brand?.language ?? null");
  });
});
