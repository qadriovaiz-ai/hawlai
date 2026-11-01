// PUTTING A SETUP STEP IN FRONT OF THE OWNER — S4/P6.
//
// THE ONE STEP THAT WAS MISSING. strategy.ts drafts setup steps from
// the audit, the Tasks page confirms draft goals, and migration 210
// requires a goal before a finding may be surfaced. Nothing wrote a
// drafted step into `goals`, so the chain had no first link and the
// daily report has been saying "Approve a plan and they will appear
// here" since 24 October, about a mechanism that did not exist.
//
// NO MODEL, ANYWHERE ON THIS PATH, and that is the reason it is here
// rather than in set_goal. set_goal calls decomposeGoal, which costs
// money on every approval, REWRITES THE TITLE — breaking the very
// link this is for — and invents tasks nobody asked for. The titles
// here are written by code in strategy.ts, and the numbers come from
// `basis`, which cannot hold anything the audit did not count.
//
// IT NEVER ACTIVATES ANYTHING. Every row is written status 'draft' and
// becomes real only when the owner presses "Confirm — create this
// plan" on the Tasks page. A manager that could approve its own goals
// would make the exit test — "each suggestion cites evidence and the
// goal it serves" — satisfy itself, which is worth nothing.
//
// AND IT OFFERS EACH STEP ONCE. /api/goals/[id]/discard sets
// 'abandoned' rather than deleting, so "already offered" has to mean
// any status at all; otherwise a step the owner discarded is back
// tomorrow morning. Migration 211's unique index holds the same rule in
// the database, where a second code path cannot get around it.

import type { DraftGoal } from "@/lib/growth/strategy";

/** What the manager writes a setup goal as. Never 'active'. */
export const DRAFT_STATUS = "draft";

/** So these are distinguishable from set_goal's and the advisor's. */
export const SETUP_GOAL_CREATED_BY = "growth_manager:setup_step";

export type GoalDraftResult = {
  /** Rows written by this run. */
  drafted: number;
  /** Steps that already had a goal row, in any status. */
  alreadyOffered: number;
  /** Rows this run tried and failed to write. */
  failed: number;
  /**
   * Setup goals sitting in 'draft', waiting for the owner.
   *
   * THE NUMBER THE REPORT NEEDS, which is not `drafted`. A step written
   * yesterday and still unconfirmed is still waiting; a report that
   * counted only today's writes would go quiet about it the next
   * morning and the owner would never hear of it again.
   */
  pending: number;
};

const NOTHING: GoalDraftResult = { drafted: 0, alreadyOffered: 0, failed: 0, pending: 0 };

/**
 * Write each setup step the owner has not already been offered.
 *
 * A FAILED READ WRITES NOTHING. Treating an unreadable table as an
 * empty one would offer every step again — against the unique index,
 * so Postgres would refuse it, but a run reporting "drafted 6" while
 * writing nothing is the instrument telling a false story, and this
 * project has paid for that five times.
 */
export async function writeSetupGoalDrafts(
  supabase: any,
  dealershipId: string,
  steps: DraftGoal[]
): Promise<GoalDraftResult> {
  const { data: existing, error } = await supabase
    .from("goals")
    .select("source_key, status")
    .eq("dealership_id", dealershipId)
    .not("source_key", "is", null);

  if (error || !Array.isArray(existing)) {
    // A MISSING COLUMN LOOKS EXACTLY LIKE THIS. Repo migrations drift
    // from production — prod was a migration behind for weeks in
    // September — so the one thing this must not do is fail quietly.
    console.error(
      `[growth] could not read existing setup goals for ${dealershipId}, so none were drafted: ${error?.message ?? "no rows returned"}. If migration 211 has not been run, goals.source_key does not exist yet.`
    );
    return { ...NOTHING, failed: steps.length };
  }

  const offered = new Set((existing as any[]).map((g) => String(g.source_key)));
  let drafted = 0;
  let failed = 0;
  let pending = (existing as any[]).filter((g) => String(g.status) === DRAFT_STATUS).length;

  for (const step of steps) {
    if (offered.has(step.key)) continue;
    const { error: insertError } = await supabase.from("goals").insert({
      dealership_id: dealershipId,
      source_key: step.key,
      status: DRAFT_STATUS,
      // VERBATIM. The owner sees the sentence the audit wrote, not a
      // model's version of it, and linkFindingsToGoals can still find
      // the goal by title if source_key is ever null.
      title: step.title,
      description: step.description,
      target_metric: step.targetMetric,
      target_value: step.targetValue,
      // EMPTY ON PURPOSE. The confirm route loops over proposed_tasks
      // and creates nothing from an empty list, which is right: a setup
      // step is one thing to do, not a plan to decompose.
      proposed_tasks: [],
      created_by: SETUP_GOAL_CREATED_BY,
    });
    if (insertError) {
      console.error(`[growth] could not draft setup goal ${step.key} for ${dealershipId}: ${insertError.message}`);
      failed += 1;
      continue;
    }
    drafted += 1;
    pending += 1;
  }

  return { drafted, alreadyOffered: steps.length - drafted - failed, failed, pending };
}
