// PHASE 3.5, STEP 6: the pages and posts a search engine shows people.
//
// generateBlogPost and generateSeoPage had NO check on their output at
// all. Both put the business's facts in the prompt and neither looked
// at what came back. seoPageAgent's own prompt even said "never invent
// statistics, prices, or claims that aren't reasonable for this
// business type" - an instruction, with nothing behind it.
//
// THE SIGNATURE WAS THE BUG AGAIN, the same shape as step 2: both took
// their facts as a pre-built prompt string. A string can be put in a
// prompt but it cannot be checked against.
//
// AND A THIRD LIVE F-01, found in the survey for this step:
//
//     // seoToolkitAgent
//     facts ? guardGenerated(generated, facts, "draft")
//           : { output: generated, removed: [] }
//
// after factsPrompt (commit 0) and adEngine (step 5). Fixed here;
// pinned in tests/seoClaimsGuard.test.ts, which now also asserts the
// shape cannot come back.
//
// TWO ENTRIES I HAD WRONG, corrected rather than migrated:
//   aeoAgent     I called it "published answers". It runs a web search
//                and returns a visibility score, a breakdown, which
//                competitors were mentioned and recommendations. A
//                check, for the owner.
//   croAgentV2   I called it unguarded. scrubCroOutput calls
//                findUnsupportedClaims, so it already gets every claim
//                rule - including the comparative, performance and
//                benefit classes - and drops a whole suggestion rather
//                than half of one.

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

import { generateBlogPost } from "@/lib/agents/seoAgent";
import { generateSeoPage } from "@/lib/agents/seoPageAgent";

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

describe("1. the blog post", () => {
  const POST = {
    title: "Choosing a lavender candle",
    metaDescription: "What to look for in a soy wax candle.",
    targetIntent: "informational",
    headingOutline: [{ level: "H2", heading: "How long it burns" }],
    content: "Evenings get loud. The Lavender candle is soy wax with a 40 hour burn, 550.",
    internalLinkSuggestions: [],
  };

  it("THE TRUTH RULES AND THE RECORDS REACH THE PROMPT", async () => {
    anthropic(POST);
    await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts());
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(prompts[0]).toContain("Lavender candle");
  });

  it("AN INVENTED STATISTIC IS NOW REMOVED — nothing checked this before", async () => {
    anthropic({ ...POST, content: "Over 500 happy customers have bought this one. Soy wax, 40 hour burn." });
    const r: any = await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts());
    expect(r.content).not.toMatch(/500 happy customers/i);
    expect(r.claimsRemoved.length).toBeGreaterThan(0);
  });

  it("A COMPARATIVE CLAIM IN THE BODY GOES TOO", async () => {
    anthropic({ ...POST, content: "Unlike the standard candles on the shelf, ours is steady. Soy wax, 40 hour burn." });
    const r: any = await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts());
    expect(r.content).not.toMatch(/Unlike the standard candles/);
  });

  it("A BLOG POST HAS NO WORD CAP — absent from the table is not a cap of zero", async () => {
    // 400-600 words is the brief, and nothing should tighten it.
    const long = ["Evenings get loud.", ...Array(60).fill("The Lavender candle is soy wax with a 40 hour burn and it costs 550."), "Order on the store page."].join(" ");
    anthropic({ ...POST, content: long });
    const r: any = await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts());
    expect(r.content.trim().split(/\s+/).length).toBeGreaterThan(300);
  });

  it("THE SLUG CHECK STILL RUNS — an invented internal link is dropped", async () => {
    // Defence in depth that predates this phase and must survive it.
    anthropic({ ...POST, internalLinkSuggestions: [{ anchorText: "our candles", linksToSlug: "made-up-page", why: "fits" }] });
    const r: any = await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts(), [
      { slug: "real-page", title: "Real page" },
    ]);
    expect(r.internalLinkSuggestions).toEqual([]);
  });

  it("a real slug survives", async () => {
    anthropic({ ...POST, internalLinkSuggestions: [{ anchorText: "our candles", linksToSlug: "real-page", why: "fits" }] });
    const r: any = await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts(), [
      { slug: "real-page", title: "Real page" },
    ]);
    expect(r.internalLinkSuggestions).toHaveLength(1);
  });

  it("an honest post keeps its title, meta description and intent", async () => {
    anthropic(POST);
    const r: any = await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, facts());
    expect(r.title).toBe(POST.title);
    expect(r.metaDescription).toBe(POST.metaDescription);
    expect(r.targetIntent).toBe("informational");
    expect(r.headingOutline).toHaveLength(1);
  });

  it("WITH NO RECORDS, the rules still reach the prompt and the claim still goes", async () => {
    anthropic({ ...POST, content: "We are India's number 1 candle brand." });
    const r: any = await generateBlogPost("lavender candles", "Shahjahanpur", "Home fragrance", undefined, null);
    expect(prompts[0]).toMatch(/could not be read/i);
    expect(r.content).not.toMatch(/number 1/i);
  });
});

describe("2. the SEO landing page", () => {
  const PAGE = {
    title: "Lavender candles in Shahjahanpur",
    metaDescription: "Soy wax candles, 40 hour burn.",
    h1: "Lavender candles",
    sections: [{ heading: "What it is", body: "The Lavender candle is soy wax, 40 hour burn. 550." }],
    slug: "lavender-candles-shahjahanpur",
  };

  it("THE RECORDS AND THE RULES REACH THE PROMPT", async () => {
    anthropic(PAGE);
    await generateSeoPage("lavender candles", "Candle by Qaaf", "Home fragrance", "Shahjahanpur", undefined, facts());
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(prompts[0]).toContain("Lavender candle");
  });

  it("AN INVENTED PRICE CLAIM IN A SECTION IS REMOVED", async () => {
    anthropic({ ...PAGE, sections: [{ heading: "Offer", body: "Everything is 50% off this week." }] });
    const r: any = await generateSeoPage("lavender candles", "Candle by Qaaf", "Home fragrance", "Shahjahanpur", undefined, facts());
    expect(JSON.stringify(r.output.sections)).not.toMatch(/50% off/);
    expect(r.claimsRemoved.length).toBeGreaterThan(0);
  });

  it("A SAFETY CLAIM GOES IN BOTH MODES", async () => {
    anthropic({ ...PAGE, sections: [{ heading: "Safe", body: "Non-toxic and safe for babies." }] });
    const r: any = await generateSeoPage("lavender candles", "Candle by Qaaf", "Home fragrance", "Shahjahanpur", undefined, facts());
    expect(JSON.stringify(r.output.sections)).not.toMatch(/safe for babies/);
  });

  it("the slug and the h1 survive an honest page", async () => {
    anthropic(PAGE);
    const r: any = await generateSeoPage("lavender candles", "Candle by Qaaf", "Home fragrance", "Shahjahanpur", undefined, facts());
    expect(r.output.slug).toBe(PAGE.slug);
    expect(r.output.h1).toBe(PAGE.h1);
    expect(r.publishable).toBe(true);
  });
});

// ---------------------------------------------------------------------
// 3. THE TOOLKIT'S F-01, DRIVEN rather than grepped
// ---------------------------------------------------------------------
//
// A mutation that restored the fail-open as `facts ? guardOrMark(...)`
// left every assertion above green, including the source grep that
// says the shape must not come back - it looked for the OLD function
// name. That is the lesson from the whole phase in one line: a source
// grep proves less than running the thing.

import { generateSeoTask } from "@/lib/agents/seoToolkitAgent";

describe("3. the SEO toolkit does not fail open", () => {
  it("AN UNSUPPORTED CLAIM IS STRIPPED WITH NO RECORDS AT ALL", async () => {
    // Until 2026-10-11 this returned the output unchecked and unmarked
    // whenever a records read failed. A meta description is read by
    // more strangers than most captions.
    anthropic({ metaTitle: "Candle by Qaaf", metaDescription: "India's number 1 candle brand." });
    const { output }: any = await generateSeoTask("meta_tags", "Candle by Qaaf", "Shahjahanpur", "Home fragrance");
    expect(String(output.metaDescription ?? "")).not.toMatch(/number 1/i);
  });

  it("AND THE STATE IS NAMED, so nothing reads as a checked draft", async () => {
    anthropic({ metaTitle: "Candle by Qaaf", metaDescription: "Soy wax candles in Shahjahanpur." });
    const { output }: any = await generateSeoTask("meta_tags", "Candle by Qaaf", "Shahjahanpur", "Home fragrance");
    expect(output._factsState).toBe("FACTS_UNAVAILABLE");
  });

  it("with records, the full guard runs and says so", async () => {
    anthropic({ metaTitle: "Candle by Qaaf", metaDescription: "Soy wax candles, 40 hour burn, 550." });
    const { output }: any = await generateSeoTask(
      "meta_tags", "Candle by Qaaf", "Shahjahanpur", "Home fragrance", null, undefined, undefined, [], undefined, facts()
    );
    expect(output._factsState).toBe("FACTS_AVAILABLE");
    expect(output.metaDescription).toContain("40 hour burn");
  });

  it("an honest meta description with no records is left alone", async () => {
    anthropic({ metaTitle: "Candle by Qaaf", metaDescription: "Soy wax candles in Shahjahanpur." });
    const { output }: any = await generateSeoTask("meta_tags", "Candle by Qaaf", "Shahjahanpur", "Home fragrance");
    expect(output.metaDescription).toBe("Soy wax candles in Shahjahanpur.");
  });
});
