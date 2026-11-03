// THE RESULTS JOB — S5/P2.
//
// Reads decisions whose check date has passed and have no outcome yet,
// measures each from counted data, and writes ONE outcome row each.
//
// IT NEVER SKIPS. A decision it cannot measure gets a `not_measurable`
// row WITH ITS REASON, not an absence. Three guards in the days before
// this was written failed by saying nothing — the dropped email, the
// discarded extractor reason, the cost counted as zero — and this one
// is the whole stage's point: "we could not tell" is a different
// outcome from "it had no effect", and only one of them is a row.
//
// NO MODEL, EVER. An outcome is counted or it is not_measurable. That
// is a design choice and this file is where it is kept.
//
// IT NAVIGATES BY FOREIGN KEY, NOT BY READING `measure`. `measure` is
// the sentence a person reads; the job follows opportunity_id to the
// finding's type, or goal_id to the goal's source_key. Parsing the
// human sentence back into a type would be a second description of a
// fact that already has a column.
//
// "BEFORE" IS RECONSTRUCTED, NOT RECORDED, and that is safe for exactly
// one reason: opportunity rows are never hard-deleted — their status
// changes and `resolved_at` is stamped — so "how many were open on the
// day of the decision" is still answerable afterwards. A source whose
// rows CAN be hard-deleted would silently under-count and would need a
// baseline written at decision time instead. None of the sources this
// job reads today is like that; the next one added has to be checked.

import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import { verdictFor, whyOutcomeIsNotWritable, type OutcomeRow } from "@/lib/growth/outcomes";
import { measureForAction, measureForFindingType, type Measure } from "@/lib/growth/measures";

export type DueDecision = {
  id: string;
  dealership_id: string;
  kind: string;
  what: string;
  measure: string;
  check_date: string;
  created_at: string;
  goal_id: string | null;
  opportunity_id: string | null;
};

export type ResultsRun = {
  day: string;
  /** Decisions whose check date had passed and had no outcome. */
  due: number;
  written: number;
  /** Of those written, how many could not be measured. */
  notMeasurable: number;
  failed: number;
  /**
   * SET WHENEVER THIS RUN DID NOT DO ITS WORK, because that is the only
   * thing the dispatcher looks at.
   *
   * WHAT THIS COST, 3 November 2026. dailyJobs.ts:154 marks a job
   * failed only when its runner returns an object with a truthy
   * `error`. This type had `failed: number` and no `error`, so the
   * first live run reported every decision as failed, wrote nothing,
   * and the Automation Health card said `done` — the silent failure
   * this whole stage exists to stop, in the stage's own code.
   *
   * `failed` counts; `error` is what makes the count visible.
   */
  error?: string;
};

/**
 * How many findings of this type were open on a given day.
 *
 * RECONSTRUCTED FROM TIMESTAMPS, so the same query shape answers both
 * "on the day of the decision" and "today" — one description of one
 * fact, read twice, rather than a stored baseline that can drift from
 * the rows it came from.
 */
export async function openFindingsAsOf(
  supabase: any,
  dealershipId: string,
  findingType: string,
  asOf: string
): Promise<number | null> {
  const endOfDay = `${String(asOf).slice(0, 10)}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from("opportunities")
    .select("id, created_at, resolved_at")
    .eq("dealership_id", dealershipId)
    .eq("type", findingType);
  // A FAILED READ IS NOT A ZERO. Zero would read as "there is nothing
  // wrong", which is the most expensive wrong answer in this loop.
  if (error || !Array.isArray(data)) return null;

  return data.filter((row: any) => {
    const created = Date.parse(String(row.created_at ?? ""));
    if (!Number.isFinite(created) || created > Date.parse(endOfDay)) return false;
    const resolved = row.resolved_at ? Date.parse(String(row.resolved_at)) : null;
    return resolved === null || !Number.isFinite(resolved) || resolved > Date.parse(endOfDay);
  }).length;
}

/** What this decision is about, as a finding type, or null. */
async function findingTypeFor(supabase: any, decision: DueDecision): Promise<string | null> {
  if (decision.opportunity_id) {
    const { data } = await supabase
      .from("opportunities")
      .select("type")
      .eq("id", decision.opportunity_id)
      .maybeSingle();
    return data?.type ? String(data.type) : null;
  }
  if (decision.goal_id) {
    const { data } = await supabase
      .from("goals")
      .select("source_key")
      .eq("id", decision.goal_id)
      .maybeSingle();
    return data?.source_key ? String(data.source_key) : null;
  }
  return null;
}

/** The measure this decision was recorded against. */
function measureFor(decision: DueDecision, findingType: string | null): Measure {
  if (findingType) return measureForFindingType(findingType);
  // An approval's measure comes from its action type, which is not on
  // the decision row — so until P3 reads it back through `why`, the
  // honest answer is the one that says what is missing.
  if (decision.kind === "approval_granted") return measureForAction("unknown");
  return { metric: decision.measure, source: null, direction: "up" };
}

/**
 * The outcome for one due decision.
 *
 * ALWAYS RETURNS A ROW. There is no path where this returns nothing:
 * the honest answer when it cannot measure is `not_measurable` with the
 * reason, which is what migration 215's fourth verdict exists for.
 */
export async function outcomeFor(
  supabase: any,
  decision: DueDecision,
  today: string
): Promise<OutcomeRow> {
  const unmeasured = (why: string): OutcomeRow => ({
    verdict: "not_measurable",
    confidence: "inferred",
    attribution: "none",
    measuredBefore: null,
    measuredAfter: null,
    whyNotMeasurable: why,
  });

  const findingType = await findingTypeFor(supabase, decision);
  const measure = measureFor(decision, findingType);

  if (measure.source !== "opportunities" || !findingType) {
    // SAYS WHAT IS MISSING, not "unknown". Each of these is a real
    // sentence about this product rather than a shrug, and each points
    // at the next piece of work.
    if (decision.kind === "goal_confirmed" && !findingType) {
      return unmeasured("this goal is not about a counted finding, so there is nothing to read");
    }
    if (decision.kind === "approval_granted") {
      return unmeasured(
        `the decision does not record which thing "${decision.what}" was about, so its effect cannot be found`
      );
    }
    return unmeasured(`this product does not collect ${measure.metric}`);
  }

  const before = await openFindingsAsOf(supabase, decision.dealership_id, findingType, decision.created_at);
  const after = await openFindingsAsOf(supabase, decision.dealership_id, findingType, today);
  if (before === null || after === null) {
    return unmeasured("the findings table could not be read, so nothing was counted");
  }

  return {
    verdict: verdictFor(before, after, measure.direction),
    // COUNTED, because both numbers are counts of rows. The weaker two
    // words exist for the cases this one does not cover.
    confidence: "counted",
    // DIRECT, because the finding type IS what the decision was about —
    // this is not an inference from traffic that happened to move.
    attribution: "direct",
    measuredBefore: before,
    measuredAfter: after,
    whyNotMeasurable: null,
  };
}

/**
 * Write outcomes for every decision that has come due.
 *
 * ONE OUTCOME PER DECISION, enforced by migration 215's unique index
 * and by reading the existing ones first — the dispatcher genuinely
 * re-enters a run whose invocation ran out of time.
 */
export async function runResultsJob(
  supabase: any,
  dealershipId: string,
  opts: { now?: Date } = {}
): Promise<ResultsRun> {
  const day = indiaToday(opts.now ?? new Date());
  const empty: ResultsRun = { day, due: 0, written: 0, notMeasurable: 0, failed: 0 };

  const { data: decisions, error } = await supabase
    .from("decisions")
    .select("id, dealership_id, kind, what, measure, check_date, created_at, goal_id, opportunity_id")
    .eq("dealership_id", dealershipId)
    .lte("check_date", day);
  if (error || !Array.isArray(decisions)) {
    const why = `could not read decisions: ${error?.message ?? "no rows"}`;
    console.error(`[results] ${why} for ${dealershipId}`);
    return { ...empty, error: why };
  }

  // NOTHING DUE IS NOT A FAILURE, and it is also the reason the first
  // version of this broke. It passed a "none" sentinel into the `.in()`
  // list to avoid an empty one — and `decision_id` is a uuid, so
  // Postgres refused the whole query with "invalid input syntax for
  // type uuid". Every run failed, wrote nothing, and reported done. The
  // empty case is handled by returning, not by inventing a value.
  if (!decisions.length) return empty;

  const { data: already, error: outcomeError } = await supabase
    .from("outcomes")
    .select("decision_id")
    .in("decision_id", decisions.map((d: any) => String(d.id)));
  // A FAILED READ IS NOT "NONE WRITTEN YET". Treating it as that would
  // try to write a second outcome for decisions that already have one —
  // refused by the unique index, so the damage would be a run reporting
  // work it did not do.
  if (outcomeError) {
    const why = `could not read existing outcomes: ${outcomeError.message}`;
    console.error(`[results] ${why} for ${dealershipId}`);
    return { ...empty, due: decisions.length, failed: decisions.length, error: why };
  }
  const done = new Set((already ?? []).map((o: any) => String(o.decision_id)));

  // ONE FILTER, NOT TWO. The query above already takes only decisions
  // whose check_date has passed (`lte`), and a second isDue() here was
  // the same fact described twice — a mutation that deleted it changed
  // nothing, which is how it was found. `isDue` is still the rule, and
  // still tested, where a caller has no query to lean on.
  const pending = (decisions as DueDecision[]).filter((d) => !done.has(String(d.id)));
  let written = 0;
  let notMeasurable = 0;
  let failed = 0;

  for (const decision of pending) {
    const row = await outcomeFor(supabase, decision, day);

    // THE SAME RULES THE DATABASE HOLDS, CHECKED BEFORE THE INSERT. A
    // row the CHECKs would refuse is a bug in this job, and finding out
    // from a constraint violation at 9am tells nobody anything useful.
    const refused = whyOutcomeIsNotWritable(row);
    if (refused) {
      console.error(`[results] refusing to write an outcome for decision ${decision.id}: ${refused}`);
      failed += 1;
      continue;
    }

    const { error: insertError } = await supabase.from("outcomes").insert({
      decision_id: decision.id,
      measured_before: row.measuredBefore,
      measured_after: row.measuredAfter,
      confidence: row.confidence,
      attribution: row.attribution,
      verdict: row.verdict,
      why_not_measurable: row.whyNotMeasurable,
    });
    if (insertError) {
      console.error(`[results] could not write an outcome for decision ${decision.id}: ${insertError.message}`);
      failed += 1;
      continue;
    }
    written += 1;
    if (row.verdict === "not_measurable") notMeasurable += 1;
  }

  return {
    day,
    due: pending.length,
    written,
    notMeasurable,
    failed,
    // A RUN THAT COULD NOT MEASURE SOME OF WHAT CAME DUE IS A FAILED
    // RUN, and the health card has to say so. `failed` on its own is a
    // number nobody looks at.
    ...(failed ? { error: `${failed} of ${pending.length} due decisions could not be given an outcome` } : {}),
  };
}
