// How many competitors and topics a plan may watch.
//
// Each watch is a searching Claude call every night, per watch, whether
// or not anyone reads the result — the only cost in the product that
// repeats forever without a person asking for it. One watch left on a
// free account bills every day for as long as the account exists.
//
// Over the cap, a watch is PAUSED and never deleted. The owner typed
// that competitor's name; losing it on a plan change would throw their
// work away silently, and a paused watch costs nothing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { WATCH_LIMIT, watchesAllowed, watchLimitMessage, splitByLimit, reconcileWatches } from "@/lib/automation/watchLimits";

describe("the caps", () => {
  it("are Free 0 / Basic 0 / Pro 1 / top tier 3", () => {
    expect(WATCH_LIMIT).toEqual({ free: 0, basic: 0, growth: 0, pro: 1, agency: 3 });
    expect(watchesAllowed("pro")).toBe(1);
    expect(watchesAllowed("agency")).toBe(3);
  });

  it("treat an unknown or missing plan as the free one", () => {
    expect(watchesAllowed(null)).toBe(0);
    expect(watchesAllowed("enterprise-made-up")).toBe(0);
  });

  it("say what the limit covers, not just that there is one", () => {
    expect(watchLimitMessage("free")).toMatch(/every night/);
    expect(watchLimitMessage("free")).toMatch(/Upgrade to Pro/);
    expect(watchLimitMessage("pro")).toMatch(/watches 1 at a time/);
  });
});

describe("which watches run tonight", () => {
  const rows = [
    { id: "w3", created_at: "2026-09-03T00:00:00Z" },
    { id: "w1", created_at: "2026-09-01T00:00:00Z" },
    { id: "w2", created_at: "2026-09-02T00:00:00Z" },
  ];

  it("KEEPS THE OLDEST, deterministically", () => {
    // The ones they set up first are the ones they have been reading,
    // and a choice that moved between nights would make the same watch
    // report intermittently — worse than either answer.
    const { active, paused } = splitByLimit(rows, 1);
    expect(active.map((w) => w.id)).toEqual(["w1"]);
    expect(paused.map((w) => w.id)).toEqual(["w2", "w3"]);
  });

  it("pauses everything on a plan with no allowance", () => {
    expect(splitByLimit(rows, 0).active).toEqual([]);
    expect(splitByLimit(rows, 0).paused).toHaveLength(3);
  });

  it("runs them all when the plan has room", () => {
    expect(splitByLimit(rows, 3).paused).toEqual([]);
  });
});

describe("bringing a business in line with its plan", () => {
  function db(rows: Record<string, any[]>) {
    const writes: { table: string; paused: boolean; ids: string[] }[] = [];
    return {
      writes,
      from(table: string) {
        let values: any = null;
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          update: (v: any) => ((values = v), chain),
          in: (_c: string, ids: string[]) => {
            writes.push({ table, paused: values.paused, ids });
            return Promise.resolve({ error: null });
          },
          then: (resolve: any) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
        };
        return chain;
      },
    };
  }

  it("pauses the extras and leaves the allowance running", async () => {
    const store = db({
      competitor_watches: [
        { id: "c1", created_at: "2026-09-01T00:00:00Z", paused: false },
        { id: "c2", created_at: "2026-09-02T00:00:00Z", paused: false },
      ],
      topic_watches: [],
    });
    const result = await reconcileWatches(store as any, "d1", "pro");
    expect(result.paused).toBe(1);
    expect(store.writes).toEqual([{ table: "competitor_watches", paused: true, ids: ["c2"] }]);
  });

  it("brings a paused one back when the plan grows", async () => {
    const store = db({
      competitor_watches: [
        { id: "c1", created_at: "2026-09-01T00:00:00Z", paused: false },
        { id: "c2", created_at: "2026-09-02T00:00:00Z", paused: true },
      ],
      topic_watches: [],
    });
    const result = await reconcileWatches(store as any, "d1", "agency");
    expect(result.resumed).toBe(1);
    expect(store.writes).toEqual([{ table: "competitor_watches", paused: false, ids: ["c2"] }]);
  });

  it("WRITES NOTHING when every flag is already right", async () => {
    // Run on every read, so it has to be free when there is nothing to
    // do. The allowance is PER MONITOR: one competitor and one topic on
    // Pro, which is the reading of "1 watch for competitor monitor and
    // topic monitor" — a shared pool would halve it.
    const store = db({
      competitor_watches: [
        { id: "c1", created_at: "2026-09-01T00:00:00Z", paused: false },
        { id: "c2", created_at: "2026-09-02T00:00:00Z", paused: true },
      ],
      topic_watches: [{ id: "t1", created_at: "2026-09-01T00:00:00Z", paused: false }],
    });
    await reconcileWatches(store as any, "d1", "pro");
    expect(store.writes).toEqual([]);
  });

  it("never deletes anything", async () => {
    const source = readFileSync("src/lib/automation/watchLimits.ts", "utf8");
    expect(source).not.toMatch(/\.delete\(/);
  });
});

describe("the surfaces that enforce it", () => {
  it("the nightly monitors skip paused watches", () => {
    for (const file of ["src/lib/automation/competitorMonitor.ts", "src/lib/automation/topicMonitor.ts"]) {
      expect(readFileSync(file, "utf8"), file).toMatch(/\.eq\("paused", false\)/);
    }
  });

  it("chat refuses BEFORE the row exists", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    const tool = brain.slice(brain.indexOf('case "manage_watch"'), brain.indexOf('case "set_automation_toggle"'));
    expect(tool).toMatch(/if \(\(existing \?\? \[\]\)\.length >= allowed\)/);
    expect(tool).toMatch(/Nothing was added/);
    expect(tool).toMatch(/do not promise to watch it yourself/);
    // The refusal comes before the insert, not after.
    expect(tool.indexOf("watchLimitMessage")).toBeLessThan(tool.indexOf(".insert("));
  });

  it("the Competitors page refuses too, and says why a watch is paused", () => {
    const route = readFileSync("src/app/api/competitor-intel/watches/route.ts", "utf8");
    expect(route).toMatch(/reconcileWatches\(supabase, dealershipId, planRow\?\.plan\)/);
    expect(route).toMatch(/status: 403/);
    const view = readFileSync("src/components/competitor/CompetitorIntelView.tsx", "utf8");
    expect(view).toMatch(/w\.paused \? "warning" : "neutral"/);
    expect(view).toMatch(/start again the moment there's room/);
  });
});
