// A competitor's price with no source, shown as if it had one.
//
// Strategy's Positioning module has refused an uncited competitor claim
// since 2026-09-19 — it builds claims out of citations and drops a quote
// from any page that isn't about the competitor named. The Competitors
// page, which is the one an owner actually opens, shared none of that
// code: it asked the model to search, parsed the JSON, and rendered it.
// A researched price and a remembered price looked identical.
//
// The tiering has the same shape of hole. It shipped on 2026-09-20 after
// a two-product candle maker was shown EKAM, a brand in hundreds of
// stores, and compared with it claim for claim — and it only ever
// applied on the Strategy page.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));
vi.mock("@/lib/research/perplexityClient", () => ({
  isPerplexityConfigured: () => false,
  callComplexResearch: async () => { throw new Error("not configured"); },
  callDeepResearch: async () => { throw new Error("not configured"); },
}));

/** A reply shaped the way Claude's web search really returns one. */
function reply(answer: object, citations: { url: string; title: string; quote: string }[]) {
  return {
    ok: true as const,
    text: JSON.stringify(answer),
    data: {
      content: [
        {
          type: "text",
          text: JSON.stringify(answer),
          citations: citations.map((c) => ({ type: "web_search_result_location", url: c.url, title: c.title, cited_text: c.quote })),
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    },
  };
}

let nextReply: any;
vi.mock("@/lib/ai/claude", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/claude")>();
  return { ...original, callClaude: async () => nextReply };
});

async function run(answer: object, citations: { url: string; title: string; quote: string }[] = []) {
  nextReply = reply(answer, citations);
  const { generateCompetitorIntel } = await import("@/lib/agents/competitorIntelAgent");
  return generateCompetitorIntel("pricing_compare", "Bodhi Candles", "candle_by_qaaf", "Home fragrance", undefined, undefined, "pro", null);
}

const BODHI = { url: "https://bodhicandles.in/shop", title: "Shop — Bodhi Candles", quote: "Bodhi Candles jar candle — ₹1,450. Free shipping over ₹2,000." };

beforeEach(() => { nextReply = undefined; });

describe("an answer that cites nothing about this competitor is refused", () => {
  it("refuses outright rather than showing an unsourced price", async () => {
    const r: any = await run({ competitorPricing: [{ item: "Jar candle", price: "₹1,450" }], comparisonNotes: "Dearer than yours." });
    expect(r._fallback).toBe(true);
    expect(r.output.text).toMatch(/couldn't find a page about this competitor/);
    // And it says what the owner can do about it.
    expect(r.output.text).toMatch(/paste a link/);
    // The unsourced price is not in the answer anywhere.
    expect(JSON.stringify(r.output)).not.toContain("1,450");
  });

  it("refuses when the only citation is about somebody else", async () => {
    // The filter that matters: a quote from a page that isn't about this
    // competitor isn't its claim, however relevant it looks.
    const r: any = await run(
      { competitorPricing: [{ item: "Jar candle", price: "₹1,450" }] },
      [{ url: "https://ekamindia.com/shop", title: "EKAM Candles", quote: "EKAM jar candle — ₹1,450." }]
    );
    expect(r._fallback).toBe(true);
    expect(r.output.text).toMatch(/couldn't find a page about this competitor/);
  });
});

describe("a sourced answer keeps its findings and shows its pages", () => {
  it("passes the competitor's own price straight through", async () => {
    const r: any = await run({ competitorPricing: [{ item: "Jar candle", price: "₹1,450" }], comparisonNotes: "Dearer than your ₹999." }, [BODHI]);
    expect(r._fallback).toBeUndefined();
    // NOT stripped. The claims guard would delete both of these in full,
    // which is why it isn't the instrument here.
    expect(r.output.competitorPricing[0].price).toBe("₹1,450");
    expect(r.output.comparisonNotes).toContain("₹999");
    expect(r.output._sources).toEqual([{ url: BODHI.url, title: BODHI.title, quote: BODHI.quote }]);
  });

  it("names the figures no cited page contains, and only those", async () => {
    const r: any = await run(
      {
        competitorPricing: [{ item: "Jar candle", price: "₹1,450" }],
        comparisonNotes: "They have 14,500 Instagram followers and stock 240 SKUs.",
      },
      [BODHI]
    );
    // ₹1,450 is in the cited quote. The follower count and the SKU count
    // are not — and a price set against an invented follower count is
    // the decision this protects.
    expect(r.output._unverified).toMatch(/14,500/);
    expect(r.output._unverified).toMatch(/240/);
    expect(r.output._unverified).not.toMatch(/1,450/);
    expect(r.output._unverified).toMatch(/unconfirmed/);
  });

  it("says nothing about figures when every one of them is sourced", async () => {
    const r: any = await run({ competitorPricing: [{ item: "Jar candle", price: "₹1,450" }] }, [BODHI]);
    expect(r.output._unverified).toBeUndefined();
  });
});

describe("the tiering reaches this page too", () => {
  it("warns that a national brand is not a like-for-like comparison", async () => {
    const r: any = await run(
      { comparisonNotes: "Available widely." },
      [{ url: "https://bodhicandles.in/about", title: "About Bodhi Candles", quote: "Bodhi Candles is stocked in 400 stores across India and on Amazon and Nykaa." }]
    );
    expect(r.output._tier).toBe("national");
    expect(r.output._tierNote).toMatch(/don't measure yourself against them line by line/);
  });

  it("leaves a business of a similar size alone", async () => {
    const r: any = await run({ comparisonNotes: "A small studio." }, [BODHI]);
    expect(r.output._tier).toBe("comparable");
    expect(r.output._tierNote).toBeUndefined();
  });

  it("judges size from the pages, not from the answer's own grouping", async () => {
    // Same rule as Strategy: read what the pages SAY about size. A model
    // that calls a chain "a small local maker" does not get to decide.
    const { tierFromSources } = await import("@/lib/competitors/citationCheck");
    const sources = [{ url: "https://x.in", title: "About", quote: "Now stocked in 400 stores nationwide." }];
    expect(tierFromSources(sources, { note: "a small local maker" })).toBe("national");
  });
});

describe("what counts as a figure", () => {
  it("takes prices, percentages and counts; leaves years and ids", async () => {
    const { figuresIn } = await import("@/lib/competitors/citationCheck");
    const found = figuresIn({
      price: "₹1,450",
      growth: "up 18%",
      followers: "14,500 followers",
      founded: "Founded in 2019",
      sourceUrl: "https://x.in/p/9876543210",
      small: "4 collections",
    });
    expect(found).toContain("₹1,450");
    expect(found).toContain("18%");
    expect(found).toContain("14,500");
    // A year is a date, not a measurement.
    expect(found).not.toContain("2019");
    // A URL's id is not a claim — the key is skipped and so is the shape.
    expect(found.join(" ")).not.toContain("9876543210");
    // Under two digits is the shape of an answer, not a datum worth
    // burying the price under.
    expect(found).not.toContain("4");
  });
});

describe("a price quoted at the end of a sentence still counts as sourced", () => {
  it("does not cry wolf over punctuation", async () => {
    // THE BUG THIS PINS: the first normaliser stripped non-digits and
    // then dropped trailing zeros whenever the text contained a full
    // stop — so "jar candle — ₹1,450." made "1450" into "145", matched
    // nothing, and a price that WAS on the cited page was reported as
    // unconfirmed. A check that cries wolf is one people stop reading.
    const r: any = await run({ competitorPricing: [{ item: "Jar candle", price: "₹1,450" }] }, [BODHI]);
    expect(r.output._unverified).toBeUndefined();
  });

  it("reads the same money written differently", async () => {
    const { checkCitations } = await import("@/lib/competitors/citationCheck");
    const data = {
      content: [{
        type: "text",
        text: "x",
        citations: [{ type: "web_search_result_location", url: "https://bodhicandles.in/p", title: "Bodhi Candles", cited_text: "Bodhi Candles: Rs 1450.00 per jar, 14,500 followers." }],
      }],
    };
    const check = checkCitations(data, { name: "Bodhi Candles" }, "Home fragrance", { price: "₹1,450", followers: "14,500" });
    expect(check.unverified).toEqual([]);
    expect(check.verified).toContain("₹1,450");
  });
});

describe("the page shows it", () => {
  it("renders the sources, the unconfirmed figures and the tier warning", () => {
    const view = readFileSync("src/components/competitor/CompetitorIntelView.tsx", "utf8");
    expect(view).toMatch(/output\?\._tierNote/);
    expect(view).toMatch(/output\?\._unverified/);
    expect(view).toMatch(/Read from these pages/);
    expect(view).toMatch(/\{s\.quote\}/);
  });

  it("chat is told to show the sources and repeat the warning", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/A competitor result carries .*_sources/);
    expect(brain).toMatch(/_unverified.*say that too/);
  });

  it("the prompt asks for a citation on every figure", () => {
    const agent = readFileSync("src/lib/agents/competitorIntelAgent.ts", "utf8");
    expect(agent).toMatch(/Cite the page for every price, follower count, percentage or other figure/);
    expect(agent).toMatch(/If you cannot find a page about this competitor at all, say exactly that/);
  });
});
