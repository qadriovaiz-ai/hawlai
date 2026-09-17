// Copy that could only be about THIS business — industry-agnostic
// overhaul follow-on, approved 2026-09-18.
//
// THE COMPLAINT: every caption came out in the same shape (hook, product
// line, price, CTA, question) and read as if it could belong to any
// business in the same category. Four causes, all covered here:
//   A. the Brand Voice Profile was gathered into the facts but printed
//      only for chat, so every other generator wrote in a house voice;
//   B. the facts held no story — how it started, how the work is done,
//      what a customer said — so there was nothing specific to write from;
//   C. the prompt prescribed the shape and never showed the model what it
//      had already written;
//   D. one shot, no editor.
//
// The constraint throughout: depth comes from the owner's OWN facts, never
// from invention — the claims guard is untouched.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { STORY_CATEGORY, STORY_QUESTIONS, cleanStoryAnswer, storyProgress } from "@/lib/business/businessStory";
import { copyTextOf, recentCopy } from "@/lib/content/recentCopy";
import { craftSection } from "@/lib/agents/contentMarketingAgent";
import { formatFactsForCopy, type BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert") {
        const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, ...payload };
        (tables[table] ??= []).push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        for (const r of rows()) Object.assign(r, payload);
        return { data: null, error: null };
      }
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api,
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      order: () => api,
      limit: () => api,
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

const VOICE = {
  personality_traits: ["dry", "unhurried"],
  vocabulary_preferences: { favor: ["poured", "batch"], avoid: ["luxurious", "elevate"] },
  sentence_rhythm: "Short sentences. One idea each.",
  formality_level: "conversational" as const,
  hinglish_ok: true,
  regional_language_notes: null,
  punctuation_emoji_style: { emoji_usage: "minimal" as const, exclamation_marks: "avoid" as const, notes: null },
  source: "manual_edit" as const,
};

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "candle_by_qaaf",
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
    brand: { tone: "warm", voice: VOICE, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: null, products: [], booking: null },
    season: seasonFor([], "2026-09-18"),
    unreadable: [],
    ...over,
  };
}

beforeEach(() => {
  tables = {};
});

// ---- A: the voice reaches the copy facts ---------------------------------------
describe("A — every generator is told how this business sounds", () => {
  it("the copy facts carry the brand voice: rhythm, words to favour, words never to use", () => {
    const block = formatFactsForCopy(facts());
    expect(block).toContain("Brand Voice");
    expect(block).toContain("Short sentences. One idea each.");
    expect(block).toContain("Words/phrases to NEVER use: luxurious, elevate.");
    expect(block).toContain("Personality: dry, unhurried.");
  });

  it("a business with no voice profile still gets its tone, not an empty block", () => {
    const block = formatFactsForCopy(facts({ brand: { ...facts().brand, voice: null } }));
    expect(block).toContain("Brand Voice");
    expect(block).toContain("warm");
  });

  it("a half-filled voice row from an older save doesn't break the prompt", () => {
    // A real brand_voice row holding only { formality_level } — found by the
    // existing canonical-facts tests the moment the voice was printed here.
    const partial = { formality_level: "professional" } as any;
    const block = formatFactsForCopy(facts({ brand: { ...facts().brand, voice: partial } }));
    expect(block).toContain("Formality: professional.");
    // The missing fields fall back to the safe profile — never "undefined"
    // printed into a prompt the model then treats as an instruction.
    expect(block).toContain("Sentence rhythm: Balanced");
    expect(block).not.toMatch(/undefined/);
  });
});

// ---- B: the story ---------------------------------------------------------------
describe("B — the owner's story, in full, in their own words", () => {
  const story = [
    { category: STORY_CATEGORY, title: "How it started", content: "I started after my mother's shop shut in 2019. " + "x".repeat(400) },
    { category: "Policies", title: "Returns", content: "y".repeat(400) },
  ];

  it("story answers print in full; other knowledge notes stay capped", () => {
    const block = formatFactsForCopy(facts({ ownerFacts: story }));
    expect(block).toContain("The owner's own story");
    expect(block).toContain("x".repeat(400));
    expect(block).not.toContain("y".repeat(220));
    expect(block).toContain("What the owner says about the business:");
  });

  it("nothing about a story appears for a business that hasn't written one", () => {
    expect(formatFactsForCopy(facts())).not.toContain("The owner's own story");
  });

  it("progress: what's answered and what's still open, in asking order", () => {
    const { answered, missing } = storyProgress(story);
    expect(answered.map((a) => a.key)).toEqual(["origin"]);
    expect(missing).toHaveLength(STORY_QUESTIONS.length - 1);
    expect(missing[0].key).toBe(STORY_QUESTIONS[1].key);
    expect(missing[0].ask).toMatch(/\?$/);
  });

  it("an answer too short to be a fact is refused; a real one is kept whole", () => {
    expect(cleanStoryAnswer("dunno")).toEqual({ ok: false, error: expect.any(String) });
    const real = cleanStoryAnswer("  We pour   in 30-candle batches because the wax\n cools unevenly above that. ");
    expect(real).toEqual({ ok: true, value: "We pour in 30-candle batches because the wax cools unevenly above that." });
  });

  it("the questions ask for specifics, not adjectives", () => {
    expect(STORY_QUESTIONS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(STORY_QUESTIONS.map((q) => q.key)).size).toBe(STORY_QUESTIONS.length);
    for (const q of STORY_QUESTIONS) expect(q.ask.length).toBeGreaterThan(20);
    const text = JSON.stringify(STORY_QUESTIONS);
    expect(text).toMatch(/started/);
    expect(text).toMatch(/actually made|actually delivered/);
    expect(text).toMatch(/refuse/);
    expect(text).toMatch(/customer has actually said/);
  });
});

describe("B — the chat asks the questions and saves the answers", () => {
  const ctx: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance" };

  it("business_story returns what's open and tells the AI to ask one at a time", async () => {
    const { executeTool } = await import("@/lib/agents/masterBrainV2");
    tables.business_knowledge = [{ dealership_id: "d1", is_active: true, category: STORY_CATEGORY, title: "How it started", content: "My mother's shop shut in 2019 and I kept her pouring pot." }];
    const r = await executeTool(db(), ctx, "business_story", {}, "");
    expect(r.answeredCount).toBe(1);
    expect(r.remaining[0].key).toBe(STORY_QUESTIONS[1].key);
    expect(r.note).toMatch(/ask the FIRST remaining question/i);
  });

  it("save_business_story files the answer as Business Knowledge, so copy may state it", async () => {
    const { executeTool, extractArtifact } = await import("@/lib/agents/masterBrainV2");
    tables.business_knowledge = [];
    const r = await executeTool(db(), ctx, "save_business_story", { key: "refuse", answer: "I won't use paraffin, even when soy trebles in price." }, "");
    expect(r.success).toBe(true);
    expect(tables.business_knowledge[0]).toMatchObject({
      dealership_id: "d1",
      category: STORY_CATEGORY,
      title: "What you refuse to do",
      content: "I won't use paraffin, even when soy trebles in price.",
      is_active: true,
    });
    expect(extractArtifact("save_business_story", {}, r)).toMatchObject({ label: "Business story: What you refuse to do" });
  });

  it("answering again replaces that answer instead of filing a second copy", async () => {
    const { executeTool } = await import("@/lib/agents/masterBrainV2");
    tables.business_knowledge = [];
    await executeTool(db(), ctx, "save_business_story", { key: "refuse", answer: "No paraffin, ever, whatever it costs me." }, "");
    await executeTool(db(), ctx, "save_business_story", { key: "refuse", answer: "No paraffin and no synthetic dyes, whatever they cost." }, "");
    expect(tables.business_knowledge).toHaveLength(1);
    expect(tables.business_knowledge[0].content).toBe("No paraffin and no synthetic dyes, whatever they cost.");
  });

  it("an unknown question, or an answer too thin to be a fact, saves nothing", async () => {
    const { executeTool } = await import("@/lib/agents/masterBrainV2");
    tables.business_knowledge = [];
    expect((await executeTool(db(), ctx, "save_business_story", { key: "invented", answer: "Something long enough to pass." }, "")).error).toMatch(/No Business Story question/);
    expect((await executeTool(db(), ctx, "save_business_story", { key: "refuse", answer: "nope" }, "")).error).toMatch(/too short/);
    expect(tables.business_knowledge).toHaveLength(0);
  });
});

// ---- C: the prompt ---------------------------------------------------------------
describe("C — one angle, real specifics, and no repeating itself", () => {
  it("asks for ONE committed angle, not a blend", () => {
    const s = craftSection("candle making workshop", [], true);
    expect(s).toMatch(/Pick ONE angle and commit to it/);
    expect(s.match(/^\d\. /gm)?.length).toBe(3);
  });

  it("names worn-out openings so they can't be used", () => {
    const s = craftSection("workshop", [], true);
    expect(s).toContain("Introducing / Meet the ...");
    expect(s).toContain("Elevate your ...");
    expect(s).toContain("Tag someone who ...");
  });

  it("drops the price-as-closing-move habit and the compulsory question", () => {
    const s = craftSection("workshop", [], true);
    expect(s).toMatch(/Mention the price only if this particular piece needs it/);
    expect(s).toMatch(/A question is one option, not the default/);
  });

  it("with a story on record it says to use it; without one it says not to pad the gap", () => {
    expect(craftSection("workshop", [], true)).toMatch(/owner's own story is in the facts above: use it/);
    expect(craftSection("workshop", [], false)).toMatch(/specifics are thin — write only what the facts support/);
  });

  it("shows the last pieces as moves not to repeat", () => {
    const s = craftSection("workshop", ["Meet our Lavender candle 🕯️ Hand-poured in small batches. ₹550."], true);
    expect(s).toMatch(/do NOT repeat their openings/);
    expect(s).toContain("Meet our Lavender candle");
  });

  it("the same topic doesn't get the same three angles every time", () => {
    // The angle lines themselves, not the rest of the section — otherwise
    // the differing "recent pieces" block would mask a fixed angle list.
    const angles = (recent: string[]) => (craftSection("workshop", recent, true).match(/^\d\. .+$/gm) ?? []).join("|");
    expect(angles([])).not.toBe(angles(["a previous caption"]));
    expect(angles([])).not.toBe(angles(["one", "two"]));
  });
});

describe("C — what 'recent' is drawn from", () => {
  it("reads the last pieces, whatever shape each was saved in, newest first and de-duplicated", async () => {
    tables.content_pieces = [
      { dealership_id: "d1", output: { text: "The wax cools unevenly above thirty candles." }, created_at: "2026-09-18" },
      { dealership_id: "d1", output: { caption: "Lavender comes in as buds, not oil." }, created_at: "2026-09-17" },
      { dealership_id: "d1", output: { text: "The wax cools unevenly above thirty candles." }, created_at: "2026-09-16" },
      { dealership_id: "other", output: { text: "Someone else's caption entirely." }, created_at: "2026-09-18" },
    ];
    expect(await recentCopy(db(), "d1", 5)).toEqual([
      "The wax cools unevenly above thirty candles.",
      "Lavender comes in as buds, not oil.",
    ]);
  });

  it("finds the words in a nested or unusual shape, and never throws", async () => {
    expect(copyTextOf({ post: { caption: "Poured at six, cool by noon." } })).toBe("Poured at six, cool by noon.");
    expect(copyTextOf({ days: [{ caption: "x" }] })).toBe("");
    expect(copyTextOf(null)).toBe("");
    tables.content_pieces = undefined as any;
    expect(await recentCopy(db(), "d1")).toEqual([]);
  });
});

// ---- D: the revision pass ----------------------------------------------------------
describe("D — the editor that cuts what any competitor could have said", () => {
  const draft = { text: "Meet our Lavender candle. Elevate your evenings. ₹550." };
  const sharper = { text: "Lavender comes in as dried buds, not oil. It takes a morning for the smell to leave the jar. ₹550." };

  function anthropic(reply: unknown, ok = true) {
    const prompts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: any, init: any) => {
      prompts.push(JSON.parse(init.body).messages[0].content);
      return ok
        ? new Response(JSON.stringify({ content: [{ text: JSON.stringify(reply) }], usage: {} }), { status: 200 })
        : new Response("", { status: 500 });
    }));
    return prompts;
  }

  it("asks the competitor test, carries the facts and the truth rules, and returns the sharper copy", async () => {
    const { reviseForSpecificity } = await import("@/lib/agents/contentMarketingAgent");
    const prompts = anthropic(sharper);
    try {
      expect(await reviseForSpecificity(draft, "Instagram Post", facts())).toEqual(sharper);
      expect(prompts[0]).toMatch(/could a competitor in the same line of work publish this exact line/i);
      expect(prompts[0]).toMatch(/Never invent a detail, number, review, offer or claim/);
      expect(prompts[0]).toContain("VERIFIED FACTS");
      expect(prompts[0]).toMatch(/TRUTH RULES/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a failed or reshaped revision leaves the first draft exactly as it was", async () => {
    const { reviseForSpecificity } = await import("@/lib/agents/contentMarketingAgent");
    anthropic(null, false);
    expect(await reviseForSpecificity(draft, "Instagram Post", facts())).toBeNull();
    vi.unstubAllGlobals();
    anthropic({ somethingElse: "wrong shape" });
    expect(await reviseForSpecificity(draft, "Instagram Post", facts())).toBeNull();
    vi.unstubAllGlobals();
    expect(await reviseForSpecificity(draft, "Instagram Post", null)).toBeNull();
  });

  it("generateContent revises when asked, and the claims guard still runs on the revised copy", async () => {
    const { generateContent } = await import("@/lib/agents/contentMarketingAgent");
    // First call: the draft. Second: a "revision" that sneaks in a rating.
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++;
      const body = call === 1 ? draft : { text: "Lavender comes in as dried buds. Rated 4.9/5 by our customers." };
      return new Response(JSON.stringify({ content: [{ text: JSON.stringify(body) }], usage: {} }), { status: 200 });
    }));
    try {
      const r = await generateContent("instagram_post", "candle_by_qaaf", "Home fragrance", "workshop", null, undefined, undefined, facts(), "draft", { revise: true });
      expect(call).toBe(2);
      expect(r.revised).toBe(true);
      expect(r.output.text).toBe("Lavender comes in as dried buds.");
      expect(r.claimsRemoved?.join(" ")).toMatch(/star rating/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("without the flag there is no second call — the auto-publish path stays single-shot", async () => {
    const { generateContent } = await import("@/lib/agents/contentMarketingAgent");
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ content: [{ text: JSON.stringify(draft) }], usage: {} }), { status: 200 });
    }));
    try {
      const r = await generateContent("instagram_post", "candle_by_qaaf", "Home fragrance", "workshop", null, undefined, undefined, facts());
      expect(calls).toBe(1);
      expect(r.revised).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---- the wiring, end to end ----------------------------------------------------------
describe("the routes that write copy", () => {
  it("the Content Marketing page asks for recent pieces and a revision; Autopilot asks for neither revision", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/api/content-marketing/generate/route.ts", "utf8");
    expect(page).toMatch(/recent: await recentCopy\(supabase, dealershipId\), revise: true/);
    const queue = readFileSync("src/app/api/autopilot/content-queue/route.ts", "utf8");
    expect(queue).toMatch(/revise: true/);
    const autopilot = readFileSync("src/lib/automation/contentAutopilot.ts", "utf8");
    expect(autopilot).toContain("{ recent }");
    expect(autopilot).not.toContain("revise: true");
  });
});
