// S5/P2 — THE RESULTS JOB, on a frozen clock.
//
// THE EXIT TEST CANNOT BE RUN FOR 28 DAYS: "after 28 days, each
// executed action has an outcome row". Nothing about this stage is
// checkable the next morning, so the clock is frozen here and the
// 28-day version stays labelled unverified until it elapses. That is
// the plan's own §4.3, and these tests are what it promised.
//
// THE PROPERTY THAT MATTERS MOST: the job NEVER SKIPS. A decision it
// cannot measure gets a `not_measurable` row with its reason, not an
// absence. Three guards in the days before this was written failed by
// saying nothing, and the whole stage exists because "we could not
// tell" is a different outcome from "it had no effect".

import { describe, it, expect, vi, afterEach } from "vitest";
import { openFindingsAsOf, outcomeFor, runResultsJob, type DueDecision } from "@/lib/growth/resultsJob";
import { code } from "./helpers/source";

afterEach(() => vi.restoreAllMocks());

const TODAY = "2026-12-01";
const NOW = new Date("2026-12-01T04:00:00.000Z"); // 09:30 IST

function decision(over: Partial<DueDecision> = {}): DueDecision {
  return {
    id: "dec1",
    dealership_id: "d1",
    kind: "suggestion_acted_on",
    what: "Acted on: 5 pages have no search title",
    measure: "open findings of type pages_without_search_title",
    check_date: TODAY,
    created_at: "2026-11-03T04:00:00.000Z",
    goal_id: null,
    opportunity_id: "o1",
    ...over,
  };
}

/** decisions / outcomes / opportunities / goals, with recorded writes. */
function db(
  seed: {
    decisions?: any[];
    outcomes?: any[];
    opportunities?: any[];
    goals?: any[];
  } = {},
  errors: Record<string, string> = {}
) {
  const tables: Record<string, any[]> = {
    decisions: seed.decisions ?? [],
    outcomes: seed.outcomes ?? [],
    opportunities: seed.opportunities ?? [],
    goals: seed.goals ?? [],
  };
  const inserts: { table: string; values: any }[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      let inList: { col: string; values: any[] } | null = null;
      let lte: { col: string; value: any } | null = null;
      let pending: any = null;
      const rows = () =>
        (tables[table] ?? [])
          .filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
          .filter((r) => (inList ? inList.values.includes(r[inList.col]) : true))
          .filter((r) => (lte ? String(r[lte.col]) <= String(lte.value) : true));
      const apply = () => {
        if (pending) {
          const values = pending;
          pending = null;
          if (errors[`${table}:insert`]) return { data: null, error: { message: errors[`${table}:insert`] } };
          inserts.push({ table, values });
          tables[table].push({ id: `${table}_${tables[table].length + 1}`, ...values });
          return { data: null, error: null };
        }
        if (errors[`${table}:select`]) return { data: null, error: { message: errors[`${table}:select`] } };
        return { data: rows(), error: null };
      };
      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        in(c: string, v: any[]) { inList = { col: c, values: v }; return chain; },
        lte(c: string, v: any) { lte = { col: c, value: v }; return chain; },
        insert(v: any) { pending = v; return chain; },
        maybeSingle: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        then: (resolve: any) => resolve(apply()),
      };
      return chain;
    },
  };
  return { client, tables, inserts };
}

/** Five findings open on 3 November, three of them closed since. */
function fiveThenTwo() {
  return [
    { id: "o1", dealership_id: "d1", type: "pages_without_search_title", created_at: "2026-10-20T00:00:00Z", resolved_at: null },
    { id: "o2", dealership_id: "d1", type: "pages_without_search_title", created_at: "2026-10-20T00:00:00Z", resolved_at: null },
    { id: "o3", dealership_id: "d1", type: "pages_without_search_title", created_at: "2026-10-20T00:00:00Z", resolved_at: "2026-11-10T00:00:00Z" },
    { id: "o4", dealership_id: "d1", type: "pages_without_search_title", created_at: "2026-10-20T00:00:00Z", resolved_at: "2026-11-11T00:00:00Z" },
    { id: "o5", dealership_id: "d1", type: "pages_without_search_title", created_at: "2026-10-20T00:00:00Z", resolved_at: "2026-11-12T00:00:00Z" },
  ];
}

describe("1. 'before' is reconstructed from the rows, not stored", () => {
  it("COUNTS WHAT WAS OPEN ON A GIVEN DAY", async () => {
    const { client } = db({ opportunities: fiveThenTwo() });
    expect(await openFindingsAsOf(client, "d1", "pages_without_search_title", "2026-11-03")).toBe(5);
    expect(await openFindingsAsOf(client, "d1", "pages_without_search_title", TODAY)).toBe(2);
  });

  it("AND A ROW CREATED AFTER THAT DAY IS NOT COUNTED ON IT", async () => {
    const { client } = db({
      opportunities: [
        { id: "late", dealership_id: "d1", type: "t", created_at: "2026-11-20T00:00:00Z", resolved_at: null },
      ],
    });
    expect(await openFindingsAsOf(client, "d1", "t", "2026-11-03")).toBe(0);
    expect(await openFindingsAsOf(client, "d1", "t", TODAY)).toBe(1);
  });

  it("A FAILED READ IS NOT A ZERO", async () => {
    // Zero would read as "there is nothing wrong", which is the most
    // expensive wrong answer in this loop.
    const { client } = db({}, { "opportunities:select": "connection reset" });
    expect(await openFindingsAsOf(client, "d1", "t", TODAY)).toBeNull();
  });
});

describe("2. THE VERDICT GOES THE RIGHT WAY", () => {
  it("FIVE FINDINGS DOWN TO TWO IS AN IMPROVEMENT", async () => {
    // THE TRAP THIS CLOSES. "open findings" is a measure where fewer is
    // better. Comparing the numbers alone would have recorded the thing
    // working exactly as intended as "worsened", and every month's
    // review would have read as failure.
    const { client } = db({ opportunities: fiveThenTwo() });
    const row = await outcomeFor(client, decision(), TODAY);
    expect(row.measuredBefore).toBe(5);
    expect(row.measuredAfter).toBe(2);
    expect(row.verdict).toBe("improved");
  });

  it("AND IT IS COUNTED AND DIRECTLY ATTRIBUTED, because the finding IS the subject", async () => {
    const { client } = db({ opportunities: fiveThenTwo() });
    const row = await outcomeFor(client, decision(), TODAY);
    expect(row.confidence).toBe("counted");
    expect(row.attribution).toBe("direct");
    expect(row.whyNotMeasurable).toBeNull();
  });

  it("and more findings than before is worse", async () => {
    const { client } = db({
      opportunities: [
        { id: "o1", dealership_id: "d1", type: "pages_without_search_title", created_at: "2026-10-01T00:00:00Z", resolved_at: null },
        { id: "o2", dealership_id: "d1", type: "pages_without_search_title", created_at: "2026-11-20T00:00:00Z", resolved_at: null },
      ],
    });
    const row = await outcomeFor(client, decision(), TODAY);
    expect(row.measuredBefore).toBe(1);
    expect(row.measuredAfter).toBe(2);
    expect(row.verdict).toBe("worsened");
  });
});

describe("3. IT NEVER SKIPS, AND IT ALWAYS SAYS WHY", () => {
  it("A GOAL ABOUT NOTHING COUNTED SAYS SO", async () => {
    // The founder's own second test: a goal with no source_key. Its
    // measure names the goal, and there is nothing to read.
    const { client } = db({ goals: [{ id: "g1", source_key: null }] });
    const row = await outcomeFor(
      client,
      decision({ kind: "goal_confirmed", goal_id: "g1", opportunity_id: null, measure: 'progress on "Test goal"' }),
      TODAY
    );
    expect(row.verdict).toBe("not_measurable");
    expect(row.whyNotMeasurable).toMatch(/not about a counted finding/);
    expect(row.measuredBefore).toBeNull();
  });

  it("AN APPROVAL SAYS WHAT THE DECISION DOES NOT RECORD", async () => {
    // Not "unknown": the decision row does not carry which page or
    // which customer the approval was about, and saying that points at
    // the next piece of work.
    const { client } = db();
    const row = await outcomeFor(
      client,
      decision({ kind: "approval_granted", opportunity_id: null, goal_id: null, what: "Approved: Send email" }),
      TODAY
    );
    expect(row.verdict).toBe("not_measurable");
    expect(row.whyNotMeasurable).toMatch(/does not record which thing/);
    expect(row.whyNotMeasurable).toMatch(/Send email/);
  });

  it("AND AN UNREADABLE FINDINGS TABLE SAYS THAT, rather than claiming no change", async () => {
    // THE GOAL HAS TO RESOLVE TO A FINDING TYPE, or this never reaches
    // the branch it is about: the first version left `goals` unseeded,
    // so source_key came back null and the row was not_measurable for a
    // completely different reason. A mutation that deleted the
    // unreadable-table branch survived it.
    const { client } = db(
      { goals: [{ id: "g1", source_key: "pages_without_search_title" }] },
      { "opportunities:select": "connection reset" }
    );
    const row = await outcomeFor(client, decision({ opportunity_id: null, goal_id: "g1" }), TODAY);
    expect(row.verdict).toBe("not_measurable");
    expect(row.whyNotMeasurable).toMatch(/could not be read/);
  });

  it("EVERY not_measurable ROW CARRIES A REASON", async () => {
    // Migration 215 refuses one without. A row this job builds that the
    // database would refuse is a bug here, and finding out from a
    // constraint violation at 9am tells nobody anything.
    const { client } = db();
    for (const kind of ["approval_granted", "goal_confirmed", "automation_switched"]) {
      const row = await outcomeFor(client, decision({ kind, opportunity_id: null, goal_id: null }), TODAY);
      if (row.verdict === "not_measurable") {
        expect(String(row.whyNotMeasurable ?? "").trim().length, kind).toBeGreaterThan(10);
      }
    }
  });
});

describe("4. ON A FROZEN CLOCK: what is due, and what is not", () => {
  it("A DECISION DUE TODAY IS MEASURED", async () => {
    const { client, inserts } = db({
      decisions: [decision({ check_date: TODAY })],
      opportunities: fiveThenTwo(),
    });
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.due).toBe(1);
    expect(r.written).toBe(1);
    expect(inserts[0].values.verdict).toBe("improved");
    expect(inserts[0].values.measured_before).toBe(5);
    expect(inserts[0].values.measured_after).toBe(2);
  });

  it("AND ONE DUE IN THE FUTURE IS LEFT ALONE", async () => {
    const { client, inserts } = db({
      decisions: [decision({ check_date: "2026-12-29" })],
      opportunities: fiveThenTwo(),
    });
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.due).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("AND ONE PAST DUE IS STILL MEASURED, not forgotten", async () => {
    // A job that only looked at today would lose every decision whose
    // day it missed — and the dispatcher does miss days.
    const { client, inserts } = db({
      decisions: [decision({ check_date: "2026-11-20" })],
      opportunities: fiveThenTwo(),
    });
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.due).toBe(1);
    expect(inserts).toHaveLength(1);
  });

  it("ONE OUTCOME PER DECISION, so a second run writes nothing", async () => {
    // The dispatcher genuinely re-enters a run whose invocation ran out
    // of time.
    const { client, inserts } = db({
      decisions: [decision()],
      opportunities: fiveThenTwo(),
    });
    await runResultsJob(client, "d1", { now: NOW });
    const second = await runResultsJob(client, "d1", { now: NOW });
    expect(second.due).toBe(0);
    expect(second.written).toBe(0);
    expect(inserts).toHaveLength(1);
  });

  it("AND A FAILED OUTCOMES READ IS NOT 'NONE WRITTEN YET'", async () => {
    // Treating it as that would try to write a second outcome for
    // decisions that already have one — refused by the unique index, so
    // the damage would be a run reporting work it did not do.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, inserts } = db(
      { decisions: [decision()], opportunities: fiveThenTwo() },
      { "outcomes:select": "connection reset" }
    );
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.written).toBe(0);
    expect(r.failed).toBe(1);
    expect(inserts).toHaveLength(0);
    expect(spy).toHaveBeenCalled();
  });

  it("and a not_measurable outcome is still a written outcome", async () => {
    const { client, inserts } = db({
      decisions: [decision({ kind: "approval_granted", opportunity_id: null, goal_id: null })],
    });
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.written).toBe(1);
    expect(r.notMeasurable).toBe(1);
    expect(inserts[0].values.verdict).toBe("not_measurable");
    expect(inserts[0].values.why_not_measurable).toBeTruthy();
  });
});

describe("5. the job's own shape", () => {
  it("NO MODEL, EVER", async () => {
    // An outcome is counted or it is not_measurable. This is where that
    // choice is kept.
    const src = code("src/lib/growth/resultsJob.ts");
    expect(src).not.toMatch(/callClaude|anthropic|openai/i);
    expect(src).not.toMatch(/fetch\(/);
  });

  it("IT NAVIGATES BY FOREIGN KEY, NOT BY PARSING `measure`", () => {
    // `measure` is the sentence a person reads. Parsing it back into a
    // type would be a second description of a fact that already has a
    // column.
    const src = code("src/lib/growth/resultsJob.ts");
    expect(src).toMatch(/decision\.opportunity_id/);
    expect(src).toMatch(/decision\.goal_id/);
    expect(src).not.toMatch(/measure\.(match|split|replace)/);
  });

  it("AND IT IS A SUBSYSTEM, NOT A NEW CRON ENTRY", () => {
    // Vercel Hobby allows exactly two and both are used, which is why
    // cronGroups.ts exists at all.
    const groups = code("src/lib/automation/cronGroups.ts");
    expect(groups).toMatch(/"decision_results"/);
    // In `signals`: it reads and writes rows and calls no model, so it
    // never queues behind LLM work.
    const signals = groups.slice(groups.indexOf("signals:"), groups.indexOf("heavy:"));
    expect(signals).toMatch(/decision_results/);
    const runners = code("src/lib/automation/dailyRunners.ts");
    expect(runners).toMatch(/decision_results: \(s, id\) => runResultsJob\(s, id\)/);
  });

  it("AND IT CHECKS THE DATABASE'S OWN RULES BEFORE INSERTING", () => {
    // A row the CHECKs would refuse is a bug in this job, and finding
    // out from a constraint violation at 9am tells nobody anything.
    const src = code("src/lib/growth/resultsJob.ts");
    expect(src).toMatch(/whyOutcomeIsNotWritable\(row\)/);
  });
});

describe("6. the live failure of 3 November 2026", () => {
  // The job answered 202, daily_jobs said status=done, error=null — and
  // `outcomes` was empty with a decision sitting there due. Two faults,
  // and the second is the one that mattered.

  it("THE OUTCOMES QUERY CARRIES ONLY REAL DECISION IDS", async () => {
    // FAULT ONE. It passed a "none" sentinel into the `.in()` list to
    // avoid an empty one, and decision_id is a uuid — so Postgres
    // refused the whole query with "invalid input syntax for type
    // uuid", every run failed, and nothing was ever written. A guess
    // about an empty list broke every real one.
    const src = code("src/lib/growth/resultsJob.ts");
    expect(src).not.toMatch(/concat\(\["none"\]\)/);
    expect(src).toMatch(/\.in\("decision_id", decisions\.map\(\(d: any\) => String\(d\.id\)\)\)/);
    // The empty case is handled by returning, not by inventing a value.
    expect(src).toMatch(/if \(!decisions\.length\) return empty;/);
  });

  it("AND NOTHING DUE IS NOT A FAILURE", async () => {
    const { client, inserts } = db({ decisions: [] });
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.due).toBe(0);
    expect(r.error).toBeUndefined();
    expect(inserts).toHaveLength(0);
  });

  it("A RUN THAT COULD NOT DO ITS WORK RETURNS error, so the dispatcher marks it FAILED", async () => {
    // FAULT TWO, AND THE ONE THAT MATTERED. dailyJobs.ts:154 marks a
    // job failed only when its runner returns an object with a truthy
    // `error`. ResultsRun had `failed: number` and no `error`, so the
    // run reported every decision as failed and the Automation Health
    // card said "done" — the silent failure this whole stage exists to
    // stop, in the stage's own code.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = db(
      { decisions: [decision()], opportunities: fiveThenTwo() },
      { "outcomes:select": "connection reset" }
    );
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.failed).toBe(1);
    expect(r.error).toMatch(/could not read existing outcomes/);
    expect(spy).toHaveBeenCalled();
  });

  it("AND SO DOES AN UNREADABLE DECISIONS TABLE", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = db({}, { "decisions:select": "connection reset" });
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.error).toMatch(/could not read decisions/);
    expect(spy).toHaveBeenCalled();
  });

  it("AND SO DOES A RUN WHERE SOME OUTCOMES COULD NOT BE WRITTEN", async () => {
    // `failed` on its own is a number nobody looks at.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = db(
      { decisions: [decision()], opportunities: fiveThenTwo() },
      { "outcomes:insert": "permission denied" }
    );
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.written).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.error).toMatch(/could not be given an outcome/);
    expect(spy).toHaveBeenCalled();
  });

  it("AND A RUN THAT DID ITS WORK RETURNS NO error", async () => {
    // The other direction: a healthy run must not be marked failed.
    const { client } = db({ decisions: [decision()], opportunities: fiveThenTwo() });
    const r = await runResultsJob(client, "d1", { now: NOW });
    expect(r.written).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it("AND THE SHAPE IS THE ONE THE DISPATCHER READS", () => {
    // Not a convention: dailyJobs.ts looks for exactly this key and
    // nothing else. A runner that reports failure any other way is a
    // runner whose failures are invisible.
    const jobs = code("src/lib/automation/dailyJobs.ts");
    expect(jobs).toMatch(/"error" in result && result\.error/);
    const src = code("src/lib/growth/resultsJob.ts");
    expect(src).toMatch(/error\?: string;/);
  });
});
