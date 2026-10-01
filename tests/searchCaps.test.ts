// Every web search a call may run is bounded.
//
// Claude's web_search tool bills per search, and `max_uses` is the only
// thing that limits it. Six call sites shipped without one, so on each of
// those the model decided how much of the owner's money to spend. The
// positioning module had always capped itself; nothing else had.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { webSearchTool, SEARCH_CAPS } from "@/lib/ai/searchCaps";

/** Every source file, so a new uncapped call site cannot hide anywhere. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("the capped tool", () => {
  it("carries max_uses from the named cap", () => {
    expect(webSearchTool("aeo_check")).toEqual({ type: "web_search_20250305", name: "web_search", max_uses: 3 });
    expect(webSearchTool("topic_monitor").max_uses).toBe(2);
  });

  it("still takes the extras a call site needs, like a domain allow-list", () => {
    expect(webSearchTool("competitor_intel", { allowed_domains: ["example.com"] })).toMatchObject({
      max_uses: 3,
      allowed_domains: ["example.com"],
    });
  });

  it("asks for less where nobody asked for anything", () => {
    // The nightly monitors run per watch, read or not, so their cost
    // repeats every day forever.
    expect(SEARCH_CAPS.competitor_monitor).toBeLessThan(SEARCH_CAPS.competitor_intel);
    expect(SEARCH_CAPS.topic_monitor).toBeLessThan(SEARCH_CAPS.deep_research);
    for (const cap of Object.values(SEARCH_CAPS)) {
      expect(cap).toBeGreaterThanOrEqual(2);
      expect(cap).toBeLessThanOrEqual(3);
    }
  });
});

describe("NO CALL SITE RUNS UNCAPPED", () => {
  it("every web_search tool in the codebase names a max_uses", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      if (file.endsWith("lib/ai/searchCaps.ts")) continue;
      const body = readFileSync(file, "utf8");
      // A literal tool definition is only acceptable with a cap on it;
      // webSearchTool() carries one by construction.
      for (const match of body.matchAll(/\{[^{}]*web_search_20250305[^{}]*\}/g)) {
        if (!/max_uses/.test(match[0])) offenders.push(`${file}: ${match[0].slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the six that were uncapped now go through the helper", () => {
    for (const file of [
      "src/lib/agents/aeoAgent.ts",
      "src/lib/agents/competitorIntelAgent.ts",
      "src/lib/agents/researchAgentV2.ts",
      "src/lib/agents/socialManagementAgent.ts",
      "src/lib/automation/competitorMonitor.ts",
      "src/lib/automation/topicMonitor.ts",
    ]) {
      const body = readFileSync(file, "utf8");
      expect(body, file).toMatch(/webSearchTool\("/);
      expect(body, file).toContain('from "@/lib/ai/searchCaps"');
    }
  });

  it("positioning keeps its own caps, which were there first", () => {
    const collect = readFileSync("src/lib/strategy/positioning/collect.ts", "utf8");
    expect(collect).toMatch(/max_uses: DISCOVERY_SEARCHES/);
    expect(collect).toMatch(/max_uses: CLAIM_SEARCHES/);
  });
});
