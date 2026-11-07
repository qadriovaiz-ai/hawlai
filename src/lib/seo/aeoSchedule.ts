// The AEO check, on a schedule — A5 of docs/PLAN-AEO-GEO.md.
//
// WHAT THIS IS NOT: a new measurement. `aeoAgent.generateAeoCheck` has
// run since A0 and already records every run into `aeo_presence`
// (migration 199) and derives a trend from it. The only thing missing
// was that it ran **on demand only**: unless the owner opened the SEO
// toolkit there was no second run to compare against, and a trend was
// the entire reason the question set was fixed in code.
//
// So this file is a cadence and a cost gate, and nothing else. The
// measuring, the recording and the trend all stay where they are.
//
// OFF BY DEFAULT — the founder's decision of 7 November 2026, the same
// one G4 ships under. Each run is a model call WITH LIVE WEB SEARCH for
// four questions, per business. With no real business on the platform
// that bills for test data, which is exactly the burn that paused
// POSITIONING_ENABLED in September.
//
// MONTHLY, AND IT DECIDES THAT ITSELF. Vercel Hobby allows two cron
// entries and both are used, so there is no third schedule to give this
// — the same constraint `monthly_review`, `page_speed` and this file all
// work around. A business's standing in an AI answer does not move
// day to day, and four web searches a day per business would cost more
// than the finding is worth.
//
// THE ARGUMENTS MUST MATCH THE ON-DEMAND CALL, and this is the one
// load-bearing thing in the file. `recordPresence` writes every run into
// the same table whatever questions were asked, and `aeoTrend` compares
// the last run with the one before it. Pass no question set and the
// model picks its own — so a scheduled run would not merely fail to
// produce a trend, it would land beside the fixed-set runs and make the
// NEXT comparison meaningless. The questions come from
// `aeoQuestionsFor`, from the same facts, exactly as
// app/api/seo/toolkit/route.ts builds them.

import { generateAeoCheck } from "@/lib/agents/aeoAgent";
import { aeoQuestionsFor } from "@/lib/seo/aeoQuestions";
import { gatherBusinessFactsSafely, factsPrompt } from "@/lib/claims/businessFacts";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

/**
 * Whether the scheduled check is switched off.
 *
 * The default is OFF, and the test for that is deliberately written the
 * strict way round: anything other than the exact string "true" pauses
 * it, so a typo in an env var cannot start spending money.
 */
export function aeoSchedulePaused(): boolean {
  return process.env.AEO_SCHEDULE_ENABLED !== "true";
}

export const PAUSED_MESSAGE =
  "Scheduled AEO checks are off. The check still runs when you open it in the SEO toolkit; nothing runs on its own, and no trend is being built.";

export type AeoRun = {
  /** The India-local day this decided about. */
  day: string;
  /** True only when a check was actually run and saved. */
  ran: boolean;
  /** Why nothing was run, in the product's own words. Null when it ran. */
  skipped: string | null;
  /** The score the run produced, when there was one. */
  score: number | null;
  /** How many of the fixed questions named this business. */
  mentionedIn: number | null;
  /** The questions asked, so a reader can see the set did not drift. */
  questions: string[];
};

/**
 * Run the AEO check for one business, if today is the day and the flag
 * is on.
 *
 * NOTHING IS SAVED ON A FAILURE. `_aiFailure` is the model or the
 * network having failed, and `_fallback` is the agent's own "couldn't
 * complete the check" shape — in both cases the honest record is no
 * record, because a saved zero reads as "this business is invisible"
 * when the truth is "nobody looked". The same rule the toolkit route
 * applies to the on-demand path.
 */
export async function runAeoSchedule(
  supabase: any,
  dealershipId: string,
  opts: { now?: Date } = {}
): Promise<AeoRun> {
  const day = indiaToday(opts.now ?? new Date());
  const empty: AeoRun = { day, ran: false, skipped: null, score: null, mentionedIn: null, questions: [] };

  if (aeoSchedulePaused()) return { ...empty, skipped: "scheduled AEO checks are off" };
  if (!day.endsWith("-01")) return { ...empty, skipped: "not the first of the month" };

  const { data: dealership, error } = await supabase
    .from("dealerships")
    .select("dealership_name, city, business_category")
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) return { ...empty, skipped: `could not read the business: ${error.message}` };

  // NO NAME, NO CHECK. The question put to a search engine is "who does
  // X in this city, and is THIS business named" — and the signup
  // placeholder would have the model judging a business called "the
  // business", then record the answer as this one's standing. The same
  // empty-fallback decision A2 made for the JSON-LD business name.
  const name = String(dealership?.dealership_name ?? "").trim();
  if (!name) return { ...empty, skipped: "the business has no name on record yet" };

  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  const questions = aeoQuestionsFor(dealership, facts);
  // AN EMPTY QUESTION SET MEANS THE MODEL WOULD CHOOSE ITS OWN, and a
  // run like that recorded next to the fixed-set runs breaks the trend
  // for every run after it. Better to skip the month.
  if (questions.length === 0) {
    return { ...empty, skipped: "no fixed questions could be built for this business" };
  }

  const { output, _fallback, _aiFailure } = await generateAeoCheck(
    name,
    dealership?.city ?? null,
    dealership?.business_category ?? "business",
    null,
    { supabase, dealershipId },
    factsPrompt(facts),
    questions
  );

  // The note carries the words lib/ai/claude.ts already approved for
  // each failure kind, so the reason the owner would read is not
  // rewritten here.
  if (_aiFailure) return { ...empty, skipped: `the check could not run: ${_aiFailure.message}`, questions };
  if (_fallback) return { ...empty, skipped: "the check came back empty, so nothing was recorded", questions };

  // Saved where the owner already looks for it. The run is otherwise
  // invisible: `aeo_presence` is the trend's own table and no screen
  // reads it as a list.
  const { error: saveError } = await supabase
    .from("seo_toolkit_items")
    .insert({ dealership_id: dealershipId, task_type: "aeo_check", topic: "", output });
  if (saveError) return { ...empty, skipped: `the check ran but could not be saved: ${saveError.message}`, questions };

  const mentionedIn = (output.competitivePositioning ?? []).filter((r) => r.mentioned).length;
  return {
    day,
    ran: true,
    skipped: null,
    score: Number.isFinite(output.visibilityScore) ? output.visibilityScore : null,
    mentionedIn,
    questions,
  };
}
