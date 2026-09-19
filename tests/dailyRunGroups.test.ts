// Daily cron subsystem grouping — R7.
//
// WHAT THESE COVER: that the split is complete and non-overlapping,
// and that the group names in vercel.json match the ones the route
// accepts. A typo in either place would silently stop a third of the
// automation from ever running — the same class of silence R7 exists
// to remove.
//
// WHAT THESE DO NOT COVER: the route handler executing. It needs a
// service-role Supabase client and fourteen agent modules, several of
// which call Claude. Exercising it would mean mocking all of them, and
// a mock shaped by my assumptions would mostly re-assert those. The
// partial-run detection is asserted by reading the source, labelled
// below as such.

import { describe, it, expect } from "vitest";
import fs from "fs";

import { GROUPS } from "@/lib/automation/cronGroups";

const ROUTE = "src/app/api/autopilot/daily-run/route.ts";
const source = fs.readFileSync(ROUTE, "utf8");
const vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

describe("subsystem grouping", () => {
  // The real constant the route imports (src/lib/automation/cronGroups.ts)
  // — it used to be parsed out of the route's source text.
  const groups: Record<string, string[]> = GROUPS;

  it("declares exactly two groups — Vercel Hobby allows two cron entries", () => {
    expect(Object.keys(groups).sort()).toEqual(["heavy", "signals"]);
  });

  it("covers all fifteen per-dealership subsystems", () => {
    const all = Object.values(groups).flat();
    expect(all).toHaveLength(15);
  });

  it("assigns every subsystem to exactly ONE group", () => {
    const all = Object.values(groups).flat();
    // An overlap would run that subsystem twice a day; a gap would
    // stop it running at all. Both are silent.
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps the slow work isolated from the fast work", () => {
    // The whole point of the split: a slow Claude call must not be
    // able to eat the budget lead scoring and approval checks need.
    expect(groups.heavy).toContain("daily_autopilot");
    expect(groups.heavy).toContain("content_autopilot");
    expect(groups.heavy).toContain("report_snapshots");
    // Third-party API work is slow too, and merged into heavy rather
    // than dropped when the plan forced two groups instead of three.
    expect(groups.heavy).toContain("google_reviews");
    expect(groups.heavy).toContain("email_automation");
    expect(groups.signals).toContain("lead_scoring");
    expect(groups.signals).toContain("stale_approvals");
    // The scheduled leads export is a database read and one email — fast.
    expect(groups.signals).toContain("lead_export");
    for (const key of groups.signals) expect(groups.heavy).not.toContain(key);
  });
});

describe("cron configuration", () => {
  const groups: Record<string, string[]> = GROUPS;

  it("schedules one cron per group", () => {
    expect(vercelConfig.crons).toHaveLength(Object.keys(groups).length);
  });

  it("every scheduled group name is one the route accepts", () => {
    for (const cron of vercelConfig.crons) {
      const group = new URL(cron.path, "https://x.test").searchParams.get("group");
      // A typo here means that third of the automation never runs, and
      // nothing would report it — the route would 400 into a cron log
      // nobody reads.
      expect(Object.keys(groups)).toContain(group);
    }
  });

  it("staggers the groups rather than firing them together", () => {
    const minutes = vercelConfig.crons.map((c: any) => c.schedule.split(" ")[0]);
    expect(new Set(minutes).size).toBe(minutes.length);
  });

  it("runs the fast signals group FIRST", () => {
    // Signals surface work waiting on a human. If anything is going to
    // be starved, it must not be that.
    const first = vercelConfig.crons
      .slice()
      .sort((a: any, b: any) => Number(a.schedule.split(" ")[0]) - Number(b.schedule.split(" ")[0]))[0];
    expect(first.path).toContain("group=signals");
  });
});

describe("partial-run detection", () => {
  // SOURCE-LEVEL assertions, labelled as such — see the file header.
  it("sets an explicit maxDuration within the Hobby plan cap", () => {
    // Its absence is the likely reason the timeout in the audit
    // finding was the steady state rather than an edge case. The cap:
    // Hobby with Fluid compute (on by default) allows 300s — Vercel's
    // docs, functions/configuring-functions/duration, checked 2026-09-20;
    // 60s was the cap without Fluid compute. Routes asking for 300 have
    // deployed here since July. A larger number is a rejected deploy.
    const match = source.match(/export const maxDuration = (\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(300);
  });

  it("a partial run is visible as unfinished or failed jobs, not a 500 in the cron log", () => {
    // Since 2026-09-15 the work runs from today's job list (lib/automation/
    // dailyJobs.ts) across hand-over invocations; the route answers 202 at
    // once. Unfinished and failed jobs are tested in tests/dailyJobs.test.ts
    // and shown on the Automation Health card.
    expect(source).toContain("after(async () => {");
    expect(source).toContain("runDailyInvocation(service, {");
    expect(source).toMatch(/status: 202/);
  });
});
