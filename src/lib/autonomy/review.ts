// THE MORNING THAT ASKS — S7/P6.
//
// `proposePromotion` knows how to ask about one action. This is what
// calls it, once a day, for the actions that may ever run unattended —
// and it is the whole of the wiring, which is why it is six lines of
// work and a page of why.
//
// IT RAISES A CARD AND NOTHING ELSE. No level is written here; the row
// is written by /api/approvals/[id] when the owner presses Approve.
//
// IN `signals`, THE DATABASE-ONLY GROUP, because it calls no model.
// cronGroups.ts's own rule, and the reason this is not beside the
// monitor: that one pays the extractor per row and lives in `heavy`.
//
// SO A CARD RAISED THIS MORNING RESTS ON YESTERDAY'S VERDICTS, since
// `signals` runs first. That is the honest ordering rather than a
// compromise: evidence that has been checked by the second judge beats
// evidence from an hour ago that nothing has looked at.

import { L2_ALLOWLIST } from "@/lib/autonomy/policy";
import { proposePromotion } from "@/lib/autonomy/promotion";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

export type AutonomyReview = {
  /** Cards raised this run. At most one per action, and usually zero. */
  asked: number;
  /** What was looked at, and why each one was not asked about. */
  skipped: { actionKey: string; why: string }[];
};

/**
 * Look at every action that may ever run unattended, and ask about the
 * ones that have earned it.
 *
 * NEVER THROWS. This runs inside the daily job list beside twelve other
 * subsystems; a thrown error here would be recorded as this subsystem
 * failing, which is right — but it must not be able to take anything
 * else with it, and `proposePromotion` already returns its reasons
 * rather than raising them.
 *
 * AND IT SAYS WHY IT DID NOT ASK. `skipped` is the thing that makes the
 * quiet mornings readable: "not approved often enough yet" is a
 * different morning from "the record could not be read", and a
 * subsystem that reported `asked: 0` for both would hide the second
 * one for weeks.
 */
export async function reviewAutonomy(
  supabase: any,
  dealershipId: string,
  today: string = indiaToday()
): Promise<AutonomyReview> {
  const out: AutonomyReview = { asked: 0, skipped: [] };

  for (const actionKey of L2_ALLOWLIST) {
    const result = await proposePromotion(supabase, dealershipId, actionKey, today);
    if (result.proposed) {
      out.asked += 1;
      // LOUD, because this is the one card in the product whose subject
      // is a permission, and the owner should be able to find the
      // morning it was raised without reading a database.
      console.error(
        `[autonomy] asked ${dealershipId} whether "${actionKey}" may run unattended — approval ${result.approvalId}`
      );
      continue;
    }
    out.skipped.push({ actionKey, why: result.why });
    // THE UNREADABLE CASES ARE SAID OUT LOUD AND THE ORDINARY ONES ARE
    // NOT. "Not approved often enough yet" is every morning for weeks
    // and belongs in the result; "the record could not be read" is a
    // fault and belongs in the log.
    if (/could not be read|could not check/i.test(result.why)) {
      console.error(`[autonomy] could not decide about "${actionKey}" for ${dealershipId}: ${result.why}`);
    }
  }

  return out;
}
