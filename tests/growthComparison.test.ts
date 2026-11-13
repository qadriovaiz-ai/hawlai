// What changed since last time — R4, and the three ways it could lie.
//
// THE FOUNDER'S DECISION, 12 November 2026: a report carries a
// before-and-after, not a status — "pehle din kya tha, kitna grow hua,
// kitna nahi hua".
//
// A COMPARISON IS THE EASIEST PLACE IN THIS PRODUCT TO FLATTER SOMEBODY,
// and all three of the rules below exist because the obvious
// implementation gets them wrong:
//
//   no baseline  ->  "leads went from 0 to 4" reads as growth when the
//                    truth is that there is nothing to compare with
//   unreadable   ->  totalSpend is null when Meta is disconnected, and
//                    null against a real number prints a collapse
//   percentages  ->  "up 400%" from one lead to five is true and useless
//
// SOURCE ASSERTIONS IN THIS FILE SLICE TO THE FUNCTION FIRST, then
// anchor inside the slice. The owner asked for that on 2026-11-12 after
// an indexOf-on-the-import fault missed its own target four times in one
// session; it is in the memory file as well as here.

import { describe, it, expect, vi } from "vitest";
import {
  movementOf,
  comparisonOf,
  movementLine,
  comparisonText,
  visitorsWeekOverWeek,
  fixedThisWeek,
  readComparison,
  COMPARED_FIELDS,
} from "@/lib/growth/comparison";
import { code } from "./helpers/source";

const NOW = new Date("2026-11-13T06:00:00Z");

/** The body of one exported function, so an assertion cannot wander. */
function bodyOf(path: string, name: string): string {
  const src = code(path);
  const start = src.indexOf(`export async function ${name}(`);
  const plain = src.indexOf(`export function ${name}(`);
  const at = start > -1 ? start : plain;
  expect(at, `${name} is not exported from ${path}`).toBeGreaterThan(-1);
  const rest = src.slice(at + 1);
  const next = rest.indexOf("\nexport ");
  const body = next > -1 ? rest.slice(0, next) : rest;
  expect(body.length, `${name}'s slice is empty`).toBeGreaterThan(80);
  return body;
}

describe("1. NO BASELINE IS NOT A BASELINE OF ZERO", () => {
  it("A FIRST REPORT SAYS THERE IS NOTHING TO COMPARE WITH", () => {
    // THE LOAD-BEARING ONE. Every business has a first week, so this is
    // the branch most owners meet first.
    const c = comparisonOf(null, { totalLeads: 4, paidOrders: 1 });
    expect(c.movements).toEqual([]);
    expect(c.noBaselineBecause).toMatch(/first report|nothing to compare|no before-and-after/i);
    expect(c.counted).toEqual([]);
  });

  it("AND IT DOES NOT REPORT GROWTH FROM ZERO", () => {
    const text = comparisonText(comparisonOf(null, { totalLeads: 4 }));
    expect(text).not.toMatch(/0 →|up 4|\+\d+%/);
  });

  it("AN EMPTY COMPARISON IS NEVER SILENT", () => {
    // An empty block reads as "nothing changed", which is a claim.
    // BOTH BRANCHES: one with a movement of zero, and one with no
    // baseline at all. Mutation M4 emptied the second and survived,
    // because this only ever exercised the first.
    expect(comparisonText(comparisonOf({ totalLeads: 2 }, { totalLeads: 2 })).length).toBeGreaterThan(10);
    expect(comparisonText(comparisonOf(null, { totalLeads: 2 })).length).toBeGreaterThan(10);
    expect(comparisonText(comparisonOf({ totalLeads: 2 }, null)).length).toBeGreaterThan(10);
  });

  it("and today's figures being unreadable is its own sentence", () => {
    const c = comparisonOf({ totalLeads: 2 }, null);
    expect(c.movements).toEqual([]);
    expect(c.noBaselineBecause).toMatch(/could not be read/i);
  });
});

describe("2. A FIGURE THAT COULD NOT BE READ IS NEVER COMPARED", () => {
  it("NULL ON EITHER SIDE REPORTS NO MOVEMENT", () => {
    // BusinessNumbers carries totalSpend: null when Meta is
    // disconnected. Comparing it would print a fall from something to
    // nothing.
    expect(movementOf("spend", null, 500)).toBeNull();
    expect(movementOf("spend", 500, null)).toBeNull();
    expect(movementOf("spend", undefined, 1)).toBeNull();
    expect(movementOf("spend", "not a number", 1)).toBeNull();
    // EVERY VALUE Number() SILENTLY TURNS INTO A NUMBER. Number("") is
    // 0 and Number(true) is 1 — neither is a figure anyone counted, and
    // mutation M6 showed the empty string was untested.
    expect(movementOf("spend", "", 500)).toBeNull();
    expect(movementOf("spend", "   ", 500)).toBeNull();
    expect(movementOf("spend", true, 500)).toBeNull();
    expect(movementOf("spend", false, 500)).toBeNull();
  });

  it("AND ZERO IS STILL COMPARED, because zero is an answer", () => {
    const m = movementOf("leads", 0, 3);
    expect(m).not.toBeNull();
    expect(m!.before).toBe(0);
    expect(m!.change).toBe(3);
  });

  it("a field missing from the earlier snapshot is skipped, not zeroed", () => {
    const c = comparisonOf({ totalLeads: 2 }, { totalLeads: 5, paidOrders: 2 });
    expect(c.movements.map((m) => m.label)).toEqual(["leads"]);
  });
});

describe("3. NO PERCENTAGE FROM A ZERO BASE", () => {
  it("FROM ZERO THERE IS NO PERCENTAGE, only the two counts", () => {
    const m = movementOf("leads", 0, 5)!;
    expect(m.percent).toBeNull();
    expect(movementLine(m)).not.toMatch(/%/);
    expect(movementLine(m)).toContain("0 → 5");
  });

  it("AND FROM A REAL BASE THERE IS ONE", () => {
    const m = movementOf("leads", 4, 5)!;
    expect(m.percent).toBe(25);
    expect(movementLine(m)).toContain("+25%");
  });

  it("A FALL IS SAID AS A FALL", () => {
    // A comparison that only reports improvement has started selling.
    const m = movementOf("leads", 10, 6)!;
    expect(m.change).toBe(-4);
    expect(m.percent).toBe(-40);
    expect(movementLine(m)).toMatch(/down 4/);
  });

  it("and no change says so rather than printing a zero", () => {
    expect(movementLine(movementOf("leads", 3, 3)!)).toMatch(/the same as before/);
  });
});

describe("4. WHAT DID NOT MOVE IS REPORTED TOO", () => {
  it("THE UNMOVED FIGURES ARE NAMED — 'kitna nahi hua'", () => {
    const c = comparisonOf(
      { totalLeads: 4, paidOrders: 2, convertedLeads: 1, totalRevenue: 1000 },
      { totalLeads: 7, paidOrders: 2, convertedLeads: 1, totalRevenue: 1000 }
    );
    const text = comparisonText(c);
    expect(text).toMatch(/leads: 4 → 7/);
    expect(text).toMatch(/No change:/);
    expect(text).toMatch(/paid orders \(2\)/);
  });

  it("AND NOTHING MOVING AT ALL IS SAID PLAINLY", () => {
    const c = comparisonOf({ totalLeads: 4 }, { totalLeads: 4 });
    expect(comparisonText(c)).toMatch(/Nothing moved either way/);
  });

  it("the window is named when there is one", () => {
    const c = comparisonOf({ totalLeads: 1 }, { totalLeads: 2 }, { since: "2026-11-06" });
    expect(comparisonText(c)).toMatch(/Compared with 2026-11-06:/);
  });
});

describe("5. EVERY FIGURE IS DECLARED, OR THE BLOCK IS PRUNED", () => {
  it("BOTH SIDES OF EVERY MOVEMENT ARE COUNTED", () => {
    // The sentence names two numbers per line, so declaring only the
    // change would have the digit walk prune the whole block — the "5
    // pages have no search title" fault.
    const c = comparisonOf({ totalLeads: 4, paidOrders: 1 }, { totalLeads: 7, paidOrders: 2 });
    const labels = c.counted.map((n) => n.label);
    expect(labels).toContain("leads before");
    expect(labels).toContain("leads now");
    expect(labels).toContain("paid orders before");
    expect(labels).toContain("paid orders now");
    expect(c.counted).toHaveLength(c.movements.length * 2);
  });

  it("AND EVERY DECLARED FIGURE NAMES WHERE IT CAME FROM", () => {
    const c = comparisonOf({ totalLeads: 4 }, { totalLeads: 7 });
    for (const n of c.counted) expect(n.source, n.label).toBe("report_snapshots");
  });

  it("every number the sentence prints is in the counted list", () => {
    const c = comparisonOf({ totalLeads: 4, paidOrders: 1 }, { totalLeads: 7, paidOrders: 1 });
    const declared = new Set(c.counted.map((n) => n.value));
    for (const m of c.movements) {
      expect(declared.has(m.before), `${m.label} before`).toBe(true);
      expect(declared.has(m.after), `${m.label} after`).toBe(true);
    }
  });
});

describe("6. VISITORS, WEEK OVER WEEK", () => {
  function eventsDb(rows: { created_at: string }[], fail = false) {
    const seen: Record<string, any>[] = [];
    const client = {
      seen,
      from() {
        const filters: Record<string, any> = {};
        const chain: any = {
          select: () => chain,
          eq: (c: string, v: any) => {
            filters[c] = v;
            return chain;
          },
          gte: (c: string, v: any) => {
            filters[`gte:${c}`] = v;
            return chain;
          },
          lt: (c: string, v: any) => {
            filters[`lt:${c}`] = v;
            return chain;
          },
          then: (res: any, rej: any) => {
            seen.push({ ...filters });
            if (fail) return Promise.resolve({ data: null, error: { message: "boom" } }).then(res, rej);
            const from = filters["gte:created_at"];
            const to = filters["lt:created_at"];
            const out = rows.filter((r) => r.created_at >= from && (!to || r.created_at < to));
            return Promise.resolve({ data: out, error: null }).then(res, rej);
          },
        };
        return chain;
      },
    };
    return client as any;
  }

  it("IT COUNTS TWO WINDOWS, not one", async () => {
    const r = await visitorsWeekOverWeek(
      eventsDb([
        { created_at: "2026-11-10T00:00:00Z" },
        { created_at: "2026-11-11T00:00:00Z" },
        { created_at: "2026-11-03T00:00:00Z" },
      ]),
      "d1",
      NOW
    );
    expect(r).not.toBeNull();
    expect(r!.thisWeek).toBe(2);
    expect(r!.lastWeek).toBe(1);
    expect(r!.change).toBe(1);
  });

  it("THE OWNER'S OWN VISITS ARE EXCLUDED — IN THE QUERY", async () => {
    // Migration 207: visits went 28 to 31 while he tested his own shop,
    // and at that volume his clicks are most of the signal.
    const db = eventsDb([]);
    await visitorsWeekOverWeek(db, "d1", NOW);
    expect(db.seen.length).toBeGreaterThan(0);
    for (const q of db.seen) expect(q.is_internal).toBe(false);
  });

  it("A FAILED READ IS NOT A WEEK OF ZERO VISITS", async () => {
    expect(await visitorsWeekOverWeek(eventsDb([], true), "d1", NOW)).toBeNull();
  });

  it("and both windows are declared", async () => {
    const r = await visitorsWeekOverWeek(eventsDb([{ created_at: "2026-11-10T00:00:00Z" }]), "d1", NOW);
    expect(r!.counted.map((c) => c.source)).toEqual(["page_events", "page_events"]);
  });
});

describe("7. WHAT WAS FIXED, AND WHAT WAS NOT", () => {
  function oppsDb(rows: any[], fail = false) {
    return {
      from: () => ({
        select: () => ({
          eq: () => (fail ? Promise.resolve({ data: null, error: { message: "boom" } }) : Promise.resolve({ data: rows, error: null })),
        }),
      }),
    } as any;
  }

  it("IT READS resolved_at, which no report has ever read", async () => {
    const r = await fixedThisWeek(
      oppsDb([
        { created_at: "2026-11-10T00:00:00Z", resolved_at: "2026-11-12T00:00:00Z", status: "completed" },
        { created_at: "2026-11-11T00:00:00Z", resolved_at: null, status: "open" },
        { created_at: "2026-01-01T00:00:00Z", resolved_at: null, status: "open" },
      ]),
      "d1",
      NOW
    );
    expect(r!.found).toBe(2);
    expect(r!.fixed).toBe(1);
    expect(r!.stillOpen).toBe(2);
  });

  it("AND STILL-OPEN COUNTS EVERY OPEN ONE, not only this week's", async () => {
    // "Kitna nahi hua" is about the backlog, not about the week.
    const r = await fixedThisWeek(
      oppsDb([{ created_at: "2026-01-01T00:00:00Z", resolved_at: null, status: "open" }]),
      "d1",
      NOW
    );
    expect(r!.found).toBe(0);
    expect(r!.stillOpen).toBe(1);
  });

  it("a failed read reports nothing rather than zero", async () => {
    expect(await fixedThisWeek(oppsDb([], true), "d1", NOW)).toBeNull();
  });
});

describe("8. THE BASELINE COMES FROM THE WEEKLY SNAPSHOT", () => {
  function snapDb(rows: any[], fail = false) {
    const seen: Record<string, any> = {};
    const client = {
      seen,
      from() {
        const chain: any = {
          select: () => chain,
          eq: (c: string, v: any) => {
            seen[c] = v;
            return chain;
          },
          order: (c: string, o: any) => {
            seen.order = { c, ...o };
            return chain;
          },
          limit: () => (fail ? Promise.resolve({ data: null, error: { message: "boom" } }) : Promise.resolve({ data: rows, error: null })),
        };
        return chain;
      },
    };
    return client as any;
  }

  it("IT ASKS FOR THE WEEKLY ROWS, NEWEST FIRST", async () => {
    const db = snapDb([{ stats: { totalLeads: 3 }, created_at: "2026-11-06T00:00:00Z" }]);
    const c = await readComparison(db, "d1", { totalLeads: 5 });
    expect(db.seen.period_type).toBe("weekly");
    expect(db.seen.order.ascending).toBe(false);
    expect(c.since).toBe("2026-11-06");
    expect(c.movements[0].change).toBe(2);
  });

  it("AND THE OLDEST WHEN ASKED, for 'since the start'", async () => {
    const db = snapDb([{ stats: { totalLeads: 1 }, created_at: "2026-10-01T00:00:00Z" }]);
    await readComparison(db, "d1", { totalLeads: 9 }, { oldest: true });
    expect(db.seen.order.ascending).toBe(true);
  });

  it("NO SNAPSHOT IS THE FIRST-WEEK SENTENCE, not an empty comparison", async () => {
    const c = await readComparison(snapDb([]), "d1", { totalLeads: 5 });
    expect(c.movements).toEqual([]);
    expect(c.noBaselineBecause).toMatch(/first report|nothing to compare/i);
  });

  it("AND AN UNREADABLE SNAPSHOT SAYS SO", async () => {
    const c = await readComparison(snapDb([], true), "d1", { totalLeads: 5 });
    expect(c.noBaselineBecause).toMatch(/could not be read/i);
  });
});

describe("9. THE REPORT CARRIES IT, ABOVE THE RAW FIGURES", () => {
  it("THE COMPARISON BLOCK IS PUSHED BEFORE THE STATS", () => {
    // A column of today's numbers answers "where am I"; he asked "what
    // moved", and that is the first thing he should read.
    const body = bodyOf("src/lib/growth/report.ts", "buildDailyReport");
    const comparisonAt = body.indexOf("input.comparison");
    const statsAt = body.indexOf("for (const c of input.counted)");
    expect(comparisonAt).toBeGreaterThan(-1);
    expect(statsAt).toBeGreaterThan(-1);
    expect(comparisonAt).toBeLessThan(statsAt);
  });

  it("AND ITS NUMBERS TRAVEL WITH IT", () => {
    const body = bodyOf("src/lib/growth/report.ts", "buildDailyReport");
    expect(body).toMatch(/numbers: comparison\.counted \?\? \[\]/);
  });

  it("THE REPORT BUILDER ASSEMBLES IT, not the daily work", () => {
    // A comparison only means something at the moment somebody is
    // looking, and after R2b nobody looks at the daily work.
    const report = bodyOf("src/lib/growth/dailyGrowth.ts", "buildGrowthReport");
    expect(report).toMatch(/readComparison\(/);
    const work = bodyOf("src/lib/growth/dailyGrowth.ts", "runGrowthWork");
    expect(work).not.toMatch(/readComparison\(/);
  });

  it("AND IT CANNOT COST THE OWNER THE REST OF HIS REPORT", () => {
    const report = bodyOf("src/lib/growth/dailyGrowth.ts", "buildGrowthReport");
    const at = report.indexOf("readComparison(");
    const around = report.slice(Math.max(0, at - 600), at + 1200);
    expect(around).toMatch(/try \{/);
    expect(around).toMatch(/catch \(err: any\) \{/);
    expect(around).not.toMatch(/catch \(err: any\) \{\s*throw/);
  });

  it("the four compared fields are the cumulative ones, named once", () => {
    expect(COMPARED_FIELDS.map((f) => f.key)).toEqual([
      "totalLeads",
      "convertedLeads",
      "paidOrders",
      "totalRevenue",
    ]);
  });
});
