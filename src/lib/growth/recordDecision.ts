// WRITING A DECISION ROW — S5/P1.
//
// One writer, so the three places a decision happens cannot each invent
// their own shape. The same reason requestApproval.ts is the only thing
// that creates an approval record: three callers writing one table is
// how two of them end up disagreeing about what a row means.
//
// IT NEVER BLOCKS WHAT IT RECORDS. A decision row is a record OF an
// action, not a step IN it. If this write fails, the owner's approval
// still stands, his goal is still confirmed, and the suggestion is
// still dismissed — he is not told his click failed because a
// bookkeeping insert did. The failure goes to the log, loudly, because
// a missing decision row means a missing outcome row and the exit test
// is about exactly that.
//
// AND IT IS IDEMPOTENT WHERE IT CAN BE. The same approval granted twice
// — a double click, a retried request — must not produce two decisions
// and two outcomes for one action.

import { checkDateFrom, STANDARD_CHECK_DAYS, type DecisionKind } from "@/lib/growth/outcomes";
import { measureForAction, measureForFindingType, type Measure } from "@/lib/growth/measures";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

export type DecisionInput = {
  dealershipId: string;
  kind: DecisionKind;
  /** The action, in the owner's terms. */
  what: string;
  /** Evidence pointers, the shape opportunities.evidence uses. */
  why?: { kind: string; id: string }[];
  measure: Measure;
  goalId?: string | null;
  opportunityId?: string | null;
  decidedBy: string;
  /**
   * What the measure read immediately BEFORE this took effect.
   *
   * CAPTURED BY THE CALLER, NOT BY THIS FUNCTION, because only the
   * caller is on the right side of the action. The results job used to
   * reconstruct it from timestamps and could not: a suggestion's own
   * resolution changes the measure about fifty milliseconds before the
   * decision row is written, so by the time anything here could look,
   * the earlier state is gone. Migration 216's header has the whole of
   * it.
   *
   * Null when there is no counted measure to read, which produces a
   * not_measurable outcome with its reason rather than a guess.
   */
  baseline?: number | null;
  /** Days until the check date. The standard wait unless told otherwise. */
  checkInDays?: number;
  now?: Date;
};

export type DecisionResult =
  | { ok: true; decisionId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Record that this was decided.
 *
 * `expected_effect` is deliberately NOT a parameter. It is nullable by
 * the founder's decision of 3 November, and none of P1's three callers
 * has an honest forecast to give: an owner approving a send is not
 * predicting a number. A caller that genuinely has one can be added
 * later; inventing one here to fill the column is the single thing this
 * product must not do.
 */
export async function recordDecision(supabase: any, input: DecisionInput): Promise<DecisionResult> {
  const day = indiaToday(input.now ?? new Date());
  const checkDate = checkDateFrom(day, input.checkInDays ?? STANDARD_CHECK_DAYS);

  // ALREADY RECORDED? A double click is one decision. Matched on the
  // thing the decision is ABOUT — the approval or the finding — rather
  // than on its wording, which a caller could phrase differently on a
  // retry.
  //
  // AND APPROVALS NEEDED THE `why` BRANCH. An approval has no goal and
  // no opportunity, and /api/approvals/[id] does NOT refuse a second
  // Approve on a row that is already approved — the executor refuses to
  // act twice, but the status is written again. So without this, one
  // click twice would be two decisions and two outcomes for one action,
  // which is the question migration 215's unique index exists to stop
  // anybody having to answer.
  const aboutId = input.opportunityId ?? input.goalId ?? null;
  const aboutWhy = !aboutId && input.why?.length === 1 ? input.why : null;
  if (aboutId || aboutWhy) {
    let query = supabase
      .from("decisions")
      .select("id")
      .eq("dealership_id", input.dealershipId)
      .eq("kind", input.kind);
    query = aboutId
      ? query.eq(input.opportunityId ? "opportunity_id" : "goal_id", aboutId)
      : query.contains("why", aboutWhy);
    const { data: existing, error: readError } = await query.limit(1);
    // A FAILED READ DOES NOT MEAN "THERE IS NONE". Writing a second row
    // on a hiccup would give one action two outcomes, which is the
    // question migration 215's unique index exists to prevent asking.
    if (readError) return { ok: false, error: readError.message };
    const found = Array.isArray(existing) ? existing[0] : null;
    if (found?.id) return { ok: true, decisionId: String(found.id), created: false };
  }

  const { data, error } = await supabase
    .from("decisions")
    .insert({
      dealership_id: input.dealershipId,
      goal_id: input.goalId ?? null,
      opportunity_id: input.opportunityId ?? null,
      kind: input.kind,
      what: input.what,
      why: input.why ?? [],
      // NULL, ALWAYS, FOR NOW. See the note on this function.
      expected_effect: null,
      measure: input.measure.metric,
      baseline: input.baseline ?? null,
      check_date: checkDate,
      decided_by: input.decidedBy,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "the decision row came back without an id" };
  return { ok: true, decisionId: String(data.id), created: true };
}

/**
 * Record a decision, and never let the failure reach the owner.
 *
 * For the three call sites, which are all in the middle of something
 * the owner just did. A bookkeeping failure must not make his click
 * look like it failed — but it must be loud in the log, because a
 * missing decision row is a missing outcome row.
 */
export async function recordDecisionQuietly(supabase: any, input: DecisionInput): Promise<void> {
  try {
    const result = await recordDecision(supabase, input);
    if (!result.ok) {
      console.error(
        `[decisions] could not record "${input.what}" (${input.kind}) for ${input.dealershipId}: ${result.error}. There will be no outcome row for it.`
      );
    }
  } catch (err: any) {
    console.error(
      `[decisions] threw while recording "${input.what}" (${input.kind}) for ${input.dealershipId}: ${err?.message}. There will be no outcome row for it.`
    );
  }
}

/**
 * How many findings of this type are open right now.
 *
 * ONE DESCRIPTION, READ TWICE: the caller reads it before the action to
 * record the baseline, and the results job reads it at the check date
 * to get the after. The as-of-a-date reconstruction this replaces was
 * the bug of 3 November — it counted the end of the decision's day for
 * "before" and the end of today for "after", which on a same-day check
 * is the same instant twice.
 *
 * NULL, NEVER ZERO, ON A FAILED READ. Zero reads as "there is nothing
 * wrong", which is the most expensive wrong answer in this loop — and
 * as a baseline it would make every later measurement a fiction.
 */
export async function openFindingsOfType(
  supabase: any,
  dealershipId: string,
  findingType: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("opportunities")
    .select("id")
    .eq("dealership_id", dealershipId)
    .eq("type", findingType)
    .eq("status", "open");
  if (error || !Array.isArray(data)) return null;
  return data.length;
}

/**
 * The pass-through rate of the step a target key names, right now.
 *
 * THE SIBLING OF openFindingsOfType, and read the same two times: by
 * the caller before acting, and by the results job at the check date.
 * One description of one fact, so the two sides cannot disagree.
 *
 * NULL, NEVER ZERO, when it cannot be read. Zero is a real rate — "none
 * of them got through" — so returning it on a failure would turn an
 * unreadable funnel into a measured disaster.
 */
export async function funnelRateFor(
  supabase: any,
  dealershipId: string,
  targetKey: string
): Promise<number | null> {
  try {
    const { loadDiagnosis } = await import("@/lib/strategy/diagnosis");
    const { weakestStepFor } = await import("@/lib/growth/targets");
    const diagnosis = await loadDiagnosis(supabase, dealershipId);
    const step = weakestStepFor(diagnosis, targetKey);
    return step ? step.rate : null;
  } catch (err: any) {
    console.error(`[decisions] could not read the funnel rate for ${targetKey} (${dealershipId}): ${err?.message}`);
    return null;
  }
}

/** The measure for a decision about a finding, by its type. */
export { measureForAction, measureForFindingType };
