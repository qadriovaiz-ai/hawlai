// "Deep research" that was a standard web search.
//
// classifyResearch already knew: with no PERPLEXITY_API_KEY it returns
// active:false and the reason "…isn't connected yet — falling back to
// Claude's own web search". When a Perplexity call fails mid-flight the
// agent catches it and runs Claude instead. Both facts went to
// console.warn and nowhere else, so the owner was handed a researched
// answer with no way to know which engine produced it or that the deeper
// one had never been available.
//
// Section 21 says a failover must not surface as an error, and that
// stands — the answer really was researched by a real substitute. Not
// saying WHICH is the part that was wrong.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));

const ANSWER = { marketOverview: "Gifting drives most Q3 demand.", customerDemographics: "Urban buyers.", demandDrivers: ["Diwali"] };

vi.mock("@/lib/ai/claude", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/claude")>();
  return {
    ...original,
    callClaude: async () => ({
      ok: true,
      text: JSON.stringify(ANSWER),
      data: { content: [{ type: "text", text: JSON.stringify(ANSWER) }], usage: { input_tokens: 10, output_tokens: 10 } },
    }),
  };
});

let perplexityBehaviour: "unused" | "works" | "throws" = "unused";
const perplexityCalls: string[] = [];

vi.mock("@/lib/research/perplexityClient", () => ({
  isPerplexityConfigured: () => perplexityBehaviour !== "unused",
  callComplexResearch: async () => {
    perplexityCalls.push("complex");
    if (perplexityBehaviour === "throws") throw new Error("503 from Perplexity");
    return { text: JSON.stringify(ANSWER), citations: [], model: "sonar-pro", inputTokens: 10, outputTokens: 10 };
  },
  callDeepResearch: async () => {
    perplexityCalls.push("deep");
    if (perplexityBehaviour === "throws") throw new Error("503 from Perplexity");
    return { text: JSON.stringify(ANSWER), citations: [], model: "sonar-deep-research", inputTokens: 10, outputTokens: 10 };
  },
}));

beforeEach(() => {
  perplexityCalls.length = 0;
  perplexityBehaviour = "unused";
});
afterEach(() => vi.unstubAllGlobals());

async function research(taskKey = "market_research") {
  const { generateResearch } = await import("@/lib/agents/researchAgentV2");
  return generateResearch(taskKey, "candle_by_qaaf", "Home fragrance", "Shahjahanpur", undefined, undefined, "pro", null);
}

async function competitor(taskKey = "pricing_compare") {
  const { generateCompetitorIntel } = await import("@/lib/agents/competitorIntelAgent");
  return generateCompetitorIntel(taskKey, "Bodhi Candles", "candle_by_qaaf", "Home fragrance", undefined, undefined, "pro", null);
}

describe("the answer says which engine produced it", () => {
  it("names Claude web search, with the search ceiling and what it costs", async () => {
    const { output }: any = await research();
    expect(output._provider).toContain("Claude web search");
    // The ceiling is a fact, not a forecast: max_uses is a hard bound,
    // which is why an upfront number is honest HERE and the tokens are
    // still not predicted.
    expect(output._provider).toMatch(/up to 3 searches/);
    expect(output._provider).toMatch(/₹2\.61 of search/);
  });

  it("does not drag Perplexity into a task it was never routed to", async () => {
    // WORTH STATING, because it corrects the premise: the Research
    // Agent's three tasks classify as STANDARD, and standard goes to
    // Claude by design — not as a fallback. So there is nothing here to
    // apologise for and the note must not imply a downgrade.
    const { output }: any = await research();
    expect(output._provider).not.toMatch(/Perplexity/);
    expect(output._provider).not.toMatch(/not deep research/);
  });

  it("does NOT call a competitor answer deep research when Perplexity isn't connected", async () => {
    // Competitor Intelligence is where the silent substitution is real:
    // all four of its tasks classify as COMPLEX.
    const { output }: any = await competitor();
    expect(output._provider).toMatch(/Perplexity isn't connected/);
    expect(output._provider).toMatch(/not deep research/);
    expect(perplexityCalls).toEqual([]);
  });

  it("says the deeper provider was unavailable when the call actually fails", async () => {
    perplexityBehaviour = "throws";
    const { output }: any = await competitor();
    expect(perplexityCalls).toEqual(["complex"]);
    // The answer still arrives — Section 21 — but not dressed up.
    expect(output.summary ?? output.marketOverview).toBeTruthy();
    expect(output._provider).toMatch(/Perplexity was unavailable just now/);
    expect(output._provider).toMatch(/substitute rather than the deeper source/);
    expect(output._aiFailure).toBeUndefined();
  });

  it("names Perplexity when Perplexity really answered", async () => {
    perplexityBehaviour = "works";
    const { output }: any = await competitor();
    expect(perplexityCalls).toEqual(["complex"]);
    expect(output._provider).toBe("Answered with Perplexity.");
    expect(output._provider).not.toMatch(/isn't connected|unavailable/);
  });

  it("says Customer Sentiment searched nothing at all", async () => {
    const { generateSentimentFromLeads } = await import("@/lib/agents/researchAgentV2");
    const leads = Array.from({ length: 4 }, (_, i) => ({ qualificationReason: `Asked about price ${i}`, temperature: "warm", status: "new" }));
    const { output }: any = await generateSentimentFromLeads("candle_by_qaaf", "Home fragrance", leads, undefined, undefined, null);
    expect(output._provider).toMatch(/4 of your own leads' qualification notes/);
    expect(output._provider).toMatch(/no web search/);
  });

  it("has no provider line on a fallback, because nothing answered", async () => {
    const { generateSentimentFromLeads } = await import("@/lib/agents/researchAgentV2");
    // Under the 3-note floor: the honest "not enough data" result.
    const result: any = await generateSentimentFromLeads("candle_by_qaaf", "Home fragrance", [{ qualificationReason: "x", temperature: "warm", status: "new" }], undefined, undefined, null);
    expect(result._fallback).toBe(true);
    expect(result.output._provider).toBeUndefined();
  });
});

describe("one source of truth for whether Perplexity exists", () => {
  it("the router asks isPerplexityConfigured instead of re-reading the env", async () => {
    const router = readFileSync("src/lib/research/researchRouter.ts", "utf8");
    expect(router).toMatch(/const perplexityReady = isPerplexityConfigured\(\);/);
    // It had its own copy of the check and the function it duplicated had
    // never been called by anything.
    expect(router).not.toMatch(/process\.env\.PERPLEXITY_API_KEY/);
  });

  it("chat is told to relay the provider and never to upgrade the label", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/If a research or competitor result carries a .*_provider.*, SAY IT/);
    expect(brain).toMatch(/NEVER call an answer "deep research" unless/);
  });
});
