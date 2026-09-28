// The chat stops re-sending its tool definitions (cost fixes, Fix 1A).
//
// The tool schema measures about 10,900 tokens and was sent in full on
// every iteration of the chat loop and every turn of the conversation —
// the largest single line in the cost audit, and the reason a three-tool
// turn cost around ₹24.
//
// A cache breakpoint on the last tool caches the whole block, because
// Anthropic renders a request as tools → system → messages and the cache
// is a prefix match. Reads cost a tenth of input, writes a quarter more,
// so it pays from the second request — which a loop reaches in seconds.
//
// NOTHING THE MODEL SEES CHANGES, and these tests exist mostly to hold
// that line: same tools, same order, same text, one metadata field.

import { describe, it, expect } from "vitest";

import { TOOLS, cachedTools } from "@/lib/agents/masterBrainV2";
import { costOfClaudeCallInr, CACHE_MULTIPLIER, PRICING } from "@/lib/usage/pricing";
import { CLAUDE_MODELS } from "@/lib/models";

const SONNET = CLAUDE_MODELS.standard;

describe("what gets cached", () => {
  const cached = cachedTools();

  it("THE MARKER IS ON THE LAST TOOL — that is what caches the whole block", () => {
    expect((cached[cached.length - 1] as any).cache_control).toEqual({ type: "ephemeral" });
    // Exactly one breakpoint: the limit is four, and more would cache
    // nothing extra here.
    expect(cached.filter((t: any) => t.cache_control)).toHaveLength(1);
  });

  it("THE TOOLS THEMSELVES ARE UNTOUCHED — same count, same order, same text", () => {
    expect(cached).toHaveLength(TOOLS.length);
    expect(cached.map((t: any) => t.name)).toEqual(TOOLS.map((t: any) => t.name));
    // Strip the one metadata field and the two are identical.
    const withoutMarker = cached.map(({ cache_control, ...rest }: any) => rest);
    expect(withoutMarker).toEqual(TOOLS);
  });

  it("is byte-identical on every call, or the prefix would never match", () => {
    expect(JSON.stringify(cachedTools())).toBe(JSON.stringify(cachedTools()));
    // Same object, so there is no chance of drift between iterations.
    expect(cachedTools()).toBe(cachedTools());
  });

  it("clears the minimum cacheable prefix for the model that runs the chat", () => {
    // Sonnet 4.6 requires 1024 tokens; Haiku would require 4096, which is
    // why the Haiku call sites are deliberately not cached.
    const approxTokens = JSON.stringify(cachedTools()).length / 4;
    expect(approxTokens).toBeGreaterThan(1024);
    expect(SONNET).toContain("sonnet");
  });

  it("the chat sends the cached array, not the bare one", () => {
    const src = require("node:fs").readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(src).toContain("tools: cachedTools()");
    expect(src).not.toMatch(/tools:\s*TOOLS\b/);
  });
});

describe("what a cached call costs", () => {
  const rate = PRICING.anthropic[SONNET].inputPerMillionUsd / 1_000_000;
  const inr = (usd: number) => Math.round(usd * PRICING.usdToInr * 10000) / 10000;

  it("a cache READ is a tenth of the input price", () => {
    const cost = costOfClaudeCallInr(0, 0, SONNET, { readTokens: 10_000 });
    expect(cost).toBeCloseTo(inr(10_000 * rate * CACHE_MULTIPLIER.read), 4);
    expect(CACHE_MULTIPLIER.read).toBe(0.1);
  });

  it("a cache WRITE is a quarter more than sending it plainly", () => {
    const cost = costOfClaudeCallInr(0, 0, SONNET, { creationTokens: 10_000 });
    expect(cost).toBeCloseTo(inr(10_000 * rate * CACHE_MULTIPLIER.write), 4);
    expect(CACHE_MULTIPLIER.write).toBe(1.25);
  });

  it("THE SAVING IS REAL AND THE FIRST CALL COSTS MORE — both, honestly priced", () => {
    const plain = costOfClaudeCallInr(10_900, 0, SONNET);
    const firstCall = costOfClaudeCallInr(0, 0, SONNET, { creationTokens: 10_900 });
    const laterCall = costOfClaudeCallInr(0, 0, SONNET, { readTokens: 10_900 });

    expect(firstCall).toBeGreaterThan(plain); // the write premium
    expect(laterCall).toBeLessThan(plain / 5); // and then it pays
    // Break-even lands on the second request: 1.25 + 0.1 < 2.
    expect(firstCall + laterCall).toBeLessThan(plain * 2);
  });

  it("an uncached call is priced exactly as before", () => {
    expect(costOfClaudeCallInr(15_500, 800, SONNET)).toBe(costOfClaudeCallInr(15_500, 800, SONNET, {}));
  });
});

describe("what gets recorded", () => {
  it("both counts reach the usage row, so the saving can be measured rather than assumed", () => {
    const logger = require("node:fs").readFileSync("src/lib/usage/logUsage.ts", "utf8");
    expect(logger).toContain("cache_creation_input_tokens: cache.creationTokens ?? null");
    expect(logger).toContain("cache_read_input_tokens: cache.readTokens ?? null");
    expect(logger).toContain("costOfClaudeCallInr(inputTokens, outputTokens, model, cache)");
  });

  it("claude.ts passes them through from the reply's own usage", () => {
    const src = require("node:fs").readFileSync("src/lib/ai/claude.ts", "utf8");
    expect(src).toContain("data.usage.cache_creation_input_tokens");
    expect(src).toContain("data.usage.cache_read_input_tokens");
  });

  it("migration 202 adds both columns, additively", () => {
    const sql = require("node:fs").readFileSync("supabase/migrations/202_usage_cache_tokens.sql", "utf8");
    expect(sql).toContain("add column if not exists cache_creation_input_tokens integer");
    expect(sql).toContain("add column if not exists cache_read_input_tokens integer");
    // Nothing dropped, nothing rewritten.
    expect(sql.toLowerCase()).not.toContain("drop ");
  });
});
