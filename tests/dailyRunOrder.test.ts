// The daily run reaches every business's emails before the AI work.
//
// THE LIVE CASE (2026-09-15): candle_by_qaaf had ONE email_automation run
// on record (10 Sep) and none on 11–15 Sep, while four other test
// businesses had theirs. The heavy invocation ran every subsystem for one
// business, then the next — each starting with daily_autopilot's AI calls —
// inside Vercel Hobby's 60 seconds. Businesses late in the list were never
// reached, and a killed invocation logs nothing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSubsystemsInOrder, type DailyDealership } from "@/lib/automation/dailyRun";
import { GROUPS, ALL, type SubsystemKey } from "@/lib/automation/cronGroups";

const BUSINESSES: DailyDealership[] = ["lala", "hind-realestate", "riverside-pottery", "bloom-and-wax", "candle_by_qaaf"].map((id) => ({ id, business_category: null }));

// Rough cost of each heavy subsystem, in seconds: the AI-backed ones are slow.
const COST: Partial<Record<SubsystemKey, number>> = { daily_autopilot: 14, report_snapshots: 4, content_autopilot: 2, email_automation: 1, workflows: 0.5, competitor_alerts: 1, topic_alerts: 1, google_reviews: 1 };

/** Runs a group like Vercel would: the invocation is killed at 60 seconds, and whatever wasn't reached never runs. */
async function simulate(order: "old-per-business" | "new-per-subsystem") {
  let clock = 0;
  const ran: string[] = [];
  const execute = async (subsystem: SubsystemKey, d: DailyDealership) => {
    clock += COST[subsystem] ?? 1;
    if (clock > 60) throw new Error("killed at 60s");
    ran.push(`${d.id}:${subsystem}`);
  };
  try {
    if (order === "new-per-subsystem") {
      await runSubsystemsInOrder({ dealerships: BUSINESSES, subsystems: GROUPS.heavy, execute });
    } else {
      // How the route used to run: per business, daily_autopilot first.
      const OLD: SubsystemKey[] = ["daily_autopilot", "email_automation", "workflows", "competitor_alerts", "topic_alerts", "report_snapshots", "content_autopilot", "google_reviews"];
      for (const d of BUSINESSES) for (const s of OLD) await execute(s, d);
    }
  } catch {
    // killed
  }
  return ran;
}

describe("the live case: five businesses, one 60-second invocation", () => {
  it("the old order never reached candle_by_qaaf's emails", async () => {
    expect(await simulate("old-per-business")).not.toContain("candle_by_qaaf:email_automation");
  });

  it("the new order sends every business's emails, workflows and posts before any AI work", async () => {
    const ran = await simulate("new-per-subsystem");
    for (const b of BUSINESSES) {
      expect(ran).toContain(`${b.id}:email_automation`);
      expect(ran).toContain(`${b.id}:workflows`);
      expect(ran).toContain(`${b.id}:content_autopilot`);
    }
  });
});

describe("the run order", () => {
  it("each subsystem runs for every business before the next subsystem starts", async () => {
    const calls: string[] = [];
    await runSubsystemsInOrder({
      dealerships: BUSINESSES.slice(0, 2),
      subsystems: ["email_automation", "daily_autopilot"],
      execute: async (s, d) => void calls.push(`${s}:${d.id}`),
    });
    expect(calls).toEqual(["email_automation:lala", "email_automation:hind-realestate", "daily_autopilot:lala", "daily_autopilot:hind-realestate"]);
  });

  it("results are kept per business and subsystem", async () => {
    const results = await runSubsystemsInOrder({ dealerships: BUSINESSES.slice(0, 1), subsystems: ["workflows"], execute: async (s, d) => `${d.id}/${s}` });
    expect(results).toEqual({ lala: { workflows: "lala/workflows" } });
  });

  it("heavy: sends first, daily_autopilot last; signals: the export email first", () => {
    expect(GROUPS.heavy.slice(0, 2)).toEqual(["email_automation", "workflows"]);
    expect(GROUPS.heavy[GROUPS.heavy.length - 1]).toBe("daily_autopilot");
    expect(GROUPS.signals[0]).toBe("lead_export");
  });

  it("every subsystem has a runner, and the route takes its order from the job list, not its own list", () => {
    const runners = readFileSync(join(__dirname, "../src/lib/automation/dailyRunners.ts"), "utf-8");
    for (const key of ALL) expect(runners).toContain("  " + key + ": (s, ");
    const route = readFileSync(join(__dirname, "../src/app/api/autopilot/daily-run/route.ts"), "utf-8");
    expect(route).toContain("runners: DAILY_RUNNERS,");
    expect(route).not.toMatch(/if \(only\("/);
  });
});
