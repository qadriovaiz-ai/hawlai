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

const ROUTE = "src/app/api/autopilot/daily-run/route.ts";
const source = fs.readFileSync(ROUTE, "utf8");
const vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

/** The subsystem keys as declared in the route's GROUPS map. */
function groupsFromSource(): Record<string, string[]> {
  const block = source.slice(source.indexOf("const GROUPS"), source.indexOf("/** Every subsystem"));
  const groups: Record<string, string[]> = {};
  for (const match of block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    groups[match[1]] = [...match[2].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  }
  return groups;
}

describe("subsystem grouping", () => {
  const groups = groupsFromSource();

  it("declares the three cost-based groups", () => {
    expect(Object.keys(groups).sort()).toEqual(["heavy", "integrations", "signals"]);
  });

  it("covers all fourteen per-dealership subsystems", () => {
    const all = Object.values(groups).flat();
    expect(all).toHaveLength(14);
  });

  it("assigns every subsystem to exactly ONE group", () => {
    const all = Object.values(groups).flat();
    // An overlap would run that subsystem twice a day; a gap would
    // stop it running at all. Both are silent.
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps the LLM-backed work isolated from the fast work", () => {
    // The whole point of the split: a slow Claude call must not be
    // able to eat the budget lead scoring and approval checks need.
    expect(groups.heavy).toContain("daily_autopilot");
    expect(groups.heavy).toContain("content_autopilot");
    expect(groups.heavy).toContain("report_snapshots");
    expect(groups.signals).toContain("lead_scoring");
    expect(groups.signals).toContain("stale_approvals");
    for (const key of groups.signals) expect(groups.heavy).not.toContain(key);
  });
});

describe("cron configuration", () => {
  const groups = groupsFromSource();

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
  it("sets an explicit maxDuration rather than inheriting the platform default", () => {
    // Its absence is the likely reason the timeout in the audit
    // finding was the steady state rather than an edge case.
    expect(source).toMatch(/export const maxDuration = \d+/);
  });

  it("counts completed work against a declared expectation", () => {
    expect(source).toContain("const expected =");
    expect(source).toContain("completed < expected");
  });

  it("returns a NON-2XX when a run is incomplete", () => {
    // The mechanism that makes a partial run visible: Vercel records
    // a failed cron invocation. A 200 with a failure count in the body
    // is the silence R7 exists to remove.
    expect(source).toMatch(/status:\s*500/);
  });
});
