// F-01, THE OTHER COPY. Three days late.
//
// F-01 was fixed on 8 October 2026 in factsGate's truthBlock: the truth
// rules are a static string, they depend on no database read, and
// interpolating them behind `facts ?` meant the one moment the model
// knew least about the business was the moment it was told least about
// what it must not say.
//
// factsPrompt() in businessFacts.ts was the SAME four lines and was not
// touched:
//
//     return f ? `...${COPY_TRUTH_RULES}` : "";
//
// Eighteen files call it - every SEO path, the website builder, the
// creative agent, the lead message, the influencer and retention
// messages, the ad engine. For those paths F-01 was never fixed.
//
// Found on 2026-10-11 while surveying for Phase 3.5. Whether it ever
// fired in production is UNVERIFIED: nothing logs a null facts read, so
// there is no record either way.
//
// THE LESSON IS THE SHAPE, NOT THE BUG. Two copies of a guard means the
// one nobody is looking at decides what the model is told. So the fix
// is not "patch the second copy" - it is that there is now ONE
// implementation and truthBlock delegates to it, pinned below.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  factsPrompt,
  COPY_TRUTH_RULES,
  FACTS_UNAVAILABLE_BRIEF,
  type BusinessFacts,
} from "@/lib/claims/businessFacts";
import { truthBlock } from "@/lib/claims/factsGate";
import { code } from "./helpers/source";

function facts(): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn" }],
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

// The four rules that matter most when nothing can be checked: a
// count, an offer, a superlative and a health claim.
const SAMPLE_RULES = [/NEVER invent numbers/i, /NEVER write an offer/i, /best, #1/i, /NEVER make health/i];

describe("factsPrompt fails CLOSED", () => {
  it("THE TRUTH RULES SURVIVE A NULL FACTS READ", () => {
    const prompt = factsPrompt(null);
    expect(prompt).toContain(COPY_TRUTH_RULES);
    for (const re of SAMPLE_RULES) expect(prompt, String(re)).toMatch(re);
  });

  it("IT IS NEVER THE EMPTY STRING", () => {
    // The exact old behaviour. An empty string is what let the rules
    // leave the prompt without anything looking wrong.
    for (const f of [null, undefined]) {
      expect(factsPrompt(f as any), String(f)).not.toBe("");
      expect(factsPrompt(f as any).trim().length).toBeGreaterThan(200);
    }
  });

  it("AND THE ABSENCE IS STATED, not left for the model to guess", () => {
    // "Nothing could be read" is the truth. "There are no products"
    // would be a claim about the business.
    const prompt = factsPrompt(null);
    expect(prompt).toContain(FACTS_UNAVAILABLE_BRIEF);
    expect(prompt).toMatch(/could not be read/i);
    expect(prompt).toMatch(/does NOT mean the business has none/i);
  });

  it("no substitute facts are invented", () => {
    // An empty facts object would make the guard report "0 paid orders
    // on record", which is a statement about the business when the
    // truth is a statement about Hawlai.
    const prompt = factsPrompt(null);
    expect(prompt).not.toMatch(/\b0 (?:paid )?orders\b/i);
    expect(prompt).not.toMatch(/no products/i);
  });

  it("with facts it is unchanged: the records and the rules both appear", () => {
    const prompt = factsPrompt(facts());
    expect(prompt).toContain("Lavender candle");
    expect(prompt).toContain(COPY_TRUTH_RULES);
    expect(prompt).not.toContain(FACTS_UNAVAILABLE_BRIEF);
  });
});

describe("ONE implementation, not two", () => {
  it("TRUTHBLOCK AND FACTSPROMPT CANNOT DISAGREE", () => {
    // The whole point. If these two ever diverge again, the paths that
    // call the quieter one lose their rules silently.
    for (const f of [null, undefined, facts()]) {
      expect(truthBlock(f as any)).toBe(factsPrompt(f as any));
    }
  });

  it("truthBlock DELEGATES rather than repeating the four lines", () => {
    const gate = code("src/lib/claims/factsGate.ts");
    expect(gate).toMatch(/return factsPrompt\(facts, audience\)/);
    // The duplicated body must be gone, not merely unused.
    expect(gate).not.toMatch(/if \(facts\) return `\\n\\n\$\{formatFactsForCopy/);
  });

  it("THE BRIEF ITSELF IS ONE STRING", () => {
    const gate = code("src/lib/claims/factsGate.ts");
    expect(gate).toMatch(/export \{ FACTS_UNAVAILABLE_BRIEF \}/);
    expect(gate).not.toMatch(/export const FACTS_UNAVAILABLE_BRIEF = `/);
  });

  it("the audience argument still reaches the facts formatter", () => {
    // customer-facing copy gets a different facts block, and
    // delegating must not have dropped it.
    expect(factsPrompt(facts(), "customer")).not.toBe(factsPrompt(facts(), "owner"));
    expect(truthBlock(facts(), "customer")).toBe(factsPrompt(facts(), "customer"));
  });
});

describe("no caller re-introduces the fail-open shape", () => {
  // Every file that actually CALLS factsPrompt, computed from the repo
  // on 2026-10-11 rather than listed from memory. 17 of them, down from
  // 22: the lead message, the retention message and the influencer
  // outreach went through generateCopy in Phase 3.5 step 2 and now pass
  // the RECORDS instead of a prompt string. That is the direction this
  // list should move - a path that hands over a pre-built string cannot
  // have its output checked.
  //
  // NOT in this list: src/app/api/brand-kit/build/route.ts, which
  // IMPORTS factsPrompt and never calls it - the brand agent calls it
  // instead. A dead import, found by this test failing on it. Harmless,
  // and left alone rather than tidied inside a guard commit.
  const CALLERS = [
    "src/app/api/ads/google/keywords/route.ts",
    "src/app/api/creative/copy-variations/route.ts",
    "src/app/api/creative/product-description/route.ts",
    "src/app/api/creative/video-script/route.ts",
    "src/app/api/seo/keywords/route.ts",
    "src/app/api/seo/toolkit/route.ts",
    "src/app/api/strategy/deep/route.ts",
    "src/app/api/strategy/route.ts",
    "src/app/api/video-marketing/generate/route.ts",
    "src/app/api/website/generate-copy/route.ts",
    "src/app/api/website-builder/generate/route.ts",
    "src/app/api/website-builder/plan/route.ts",
    "src/lib/adEngine.ts",
    "src/lib/agents/brandBuildingAgent.ts",
    "src/lib/agents/competitorIntelAgent.ts",
    "src/lib/agents/researchAgentV2.ts",
    "src/lib/agents/websiteBuilderAgent.ts",
  ];

  it("ALL 17 ARE COVERED — the count is asserted so a new one is noticed", () => {
    expect(CALLERS.length).toBe(17);
  });

  it("NOBODY GUARDS THE CALL WITH A TERNARY ON FACTS", () => {
    // `facts ? factsPrompt(facts) : ""` at a call site would restore
    // the bug one file at a time, and it reads as harmless.
    for (const f of CALLERS) {
      const src = code(f);
      expect(src, f).not.toMatch(/facts\s*\?\s*factsPrompt/);
      expect(src, f).not.toMatch(/factsPrompt\([^)]*\)\s*:\s*""/);
    }
  });

  it("and every one of them still passes the prompt at all", () => {
    // A path that stopped calling it would lose the rules just as
    // completely, and the test above would still pass.
    for (const f of CALLERS) expect(code(f), f).toMatch(/factsPrompt\(/);
  });
});

// ---------------------------------------------------------------------
// THE EXECUTION TEST: a real unguarded path, driven end to end
// ---------------------------------------------------------------------
//
// generateBlogPost is one of the eleven paths with no claims check on
// its output, so the prompt is the ONLY protection it has. If the rules
// are missing from the prompt, nothing else stops the model.

let prompts: string[];
function anthropic(answer: any) {
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const payload = { content: [{ type: "text", text: JSON.stringify(answer) }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
  }));
}

import { generateBlogPost } from "@/lib/agents/seoAgent";

// NOTE, 2026-10-11. When this file was written generateBlogPost took a
// pre-built prompt string and had NO check on its output - the prompt
// was its only protection, which is why it was chosen here. In Phase
// 3.5 step 6 it went through the door and now takes the RECORDS, so
// these three drive it that way. What is being tested is unchanged:
// with no records readable, the truth rules still reach the model.
describe("a path with no output guard still gets the rules when the records fail", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("THE BLOG PROMPT CARRIES THE TRUTH RULES WITH NULL FACTS", async () => {
    anthropic({ title: "Lavender at home", content: "Soy wax, 40 hour burn.", metaDescription: "x", headingOutline: [] });
    await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, null);
    expect(prompts.length).toBeGreaterThan(0);
    for (const re of SAMPLE_RULES) expect(prompts[0], String(re)).toMatch(re);
  });

  it("AND IT IS TOLD THE RECORDS COULD NOT BE READ", async () => {
    anthropic({ title: "t", content: "c", metaDescription: "m", headingOutline: [] });
    await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, null);
    expect(prompts[0]).toMatch(/could not be read/i);
  });

  it("with facts, the records reach the prompt as before", async () => {
    anthropic({ title: "t", content: "c", metaDescription: "m", headingOutline: [] });
    await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts());
    expect(prompts[0]).toContain("Lavender candle");
    for (const re of SAMPLE_RULES) expect(prompts[0], String(re)).toMatch(re);
  });
});
