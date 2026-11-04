// WHO ACTUALLY USES THE GROWTH REPORT — S6/P4.
//
// WHY THIS FILE EXISTS, and it is a near-miss rather than a bug.
// `docs/PLAN-CORE-ARCHITECTURE.md` §4.2 listed
// `growthAdvisorAgent` / `growthAdvisorV2` as "the clearest duplicate
// in the repo", because one route imports both. The founder approved
// retiring one of them. Reading the two files is what stopped it:
// `generateGrowthReport` is not a second advisor, it is a SHARED
// SERVICE — and one of its callers is V2 itself, which passes its
// health score and risks into the expansion-strategy prompt.
//
// So this pins its real consumers, with the reason. Anyone who comes
// back to "finish the cleanup" finds out here, from a test, instead of
// from a dashboard page that stopped rendering.
//
// WHAT IS GONE is the HTTP route around it: `/api/growth-report` had
// zero callers, was session-gated so nothing outside the app could
// reach it, and called a model — a dead surface that spent money if
// anybody ever hit it. The function it wrapped is untouched.

import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { code } from "./helpers/source";

/**
 * The module, in either import style.
 *
 * masterBrainV2.ts imports it relatively ("./growthAdvisorAgent") and
 * everyone else through the alias. The first version of this check
 * looked for the alias alone and reported the chat tool as a consumer
 * that had dropped it — a false alarm that would have read as
 * permission to delete something.
 */
const AGENT = "@/lib/agents/growthAdvisorAgent";
const importsAgent = (src: string) =>
  src.includes(AGENT) || /from "\.\/growthAdvisorAgent"/.test(src);

describe("1. THE SHARED SERVICE HAS FOUR REAL CONSUMERS", () => {
  const consumers: { file: string; why: string }[] = [
    {
      file: "src/app/dashboard/overview/page.tsx",
      why: "the dashboard overview page renders it as a server component — no HTTP hop, which is why deleting the route changed nothing here",
    },
    {
      file: "src/lib/reports/reportBundle.ts",
      why: "the report bundle passes its own counted numbers in, so the narrative and the cards cannot diverge",
    },
    {
      file: "src/lib/agents/masterBrainV2.ts",
      why: "the get_growth_advice chat tool",
    },
    {
      file: "src/app/api/growth-advisor/generate/route.ts",
      why: "growthAdvisorV2's expansion_strategy task, which passes the health score and risks in as context — the caller that made the pair look like a duplicate",
    },
  ];

  it("EVERY ONE OF THEM STILL IMPORTS IT", () => {
    const missing: string[] = [];
    for (const { file, why } of consumers) {
      if (!existsSync(file)) {
        missing.push(`${file} is gone — ${why}`);
        continue;
      }
      if (!importsAgent(code(file))) missing.push(`${file} no longer imports it — ${why}`);
    }
    expect(
      missing,
      `The growth report is a shared service, not a duplicate advisor. If one of these genuinely no longer needs it, delete its entry here and say why:\n${missing.join("\n")}`
    ).toEqual([]);
  });

  it("AND ONE OF THEM IS growthAdvisorV2's OWN TASK, which is the whole point", () => {
    // The fact that made the two look like one job: a single route
    // imports both, because the second asks the first for a number.
    const route = code("src/app/api/growth-advisor/generate/route.ts");
    expect(route).toContain(AGENT);
    expect(route).toContain("@/lib/agents/growthAdvisorV2");
    expect(route).toMatch(/generateGrowthReport\(/);
    expect(route).toMatch(/generateExpansionStrategy\(/);
    // The health score travels as CONTEXT into the other agent's prompt.
    expect(route).toMatch(/growth\.healthScore/);
  });

  it("and each consumer carries a reason, not just a path", () => {
    for (const { file, why } of consumers) expect(why.length, file).toBeGreaterThan(30);
  });
});

describe("2. THE DEAD ROUTE IS GONE, AND ONLY THE ROUTE", () => {
  it("THE HTTP SURFACE IS DELETED", () => {
    expect(existsSync("src/app/api/growth-report/route.ts")).toBe(false);
  });

  it("AND THE FUNCTION IT WRAPPED IS NOT", () => {
    // The distinction this whole phase turns on: a dead surface is not
    // a dead capability.
    expect(existsSync("src/lib/agents/growthAdvisorAgent.ts")).toBe(true);
    expect(code("src/lib/agents/growthAdvisorAgent.ts")).toMatch(/export async function generateGrowthReport/);
  });

  it("and nothing in the codebase asked for that URL", () => {
    // Re-checked here rather than trusted: the only `growth-report`
    // string left is an email idempotency key, which is not a URL.
    const dailyGrowth = code("src/lib/growth/dailyGrowth.ts");
    expect(dailyGrowth).toMatch(/idempotencyKey: `growth-report-/);
    expect(dailyGrowth).not.toMatch(/fetch\([^)]*growth-report/);
  });
});
