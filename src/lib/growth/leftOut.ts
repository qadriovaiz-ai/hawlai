// WHICH BLOCK WAS LEFT OUT OF AN EMAIL, AND OVER WHICH FIGURE.
//
// 6 November 2026, the founder's request. Since 3 November a report
// block whose figures nobody counted is pruned rather than taking the
// whole email down with it, and the email says so: "I left 1 thing out
// of this email, because a figure in it did not trace back to anything
// I counted."
//
// THE OWNER WAS TOLD SOMETHING WAS MISSING AND GIVEN NO WAY TO FIND IT.
// `blocksLeftOut` was a count in a run result that the call site
// dropped, and `removed` — the block kinds and the offending figures —
// existed only inside the function and in a `console.error` line in
// Vercel's logs, which he has never read. That is the same shape as the
// fault the pruning rule was written to fix: the product knew, and said
// so where nobody was looking.
//
// IT GOES IN audit_log, which migration 128 already built for this: the
// owner can SELECT his own rows, nothing can UPDATE or DELETE them, and
// `event_type` is deliberately free text so a new source does not need
// a migration. No new table, no SQL for the owner to run.
//
// THE CONSOLE LINE STAYS, and it is not redundant. These two records
// fail in different ways: the audit write needs the database to be
// reachable, and the log line is written whatever happens. The one
// thing this must not do is be the only record and be a silent one.

import { logAuditEvent } from "@/lib/audit/logAuditEvent";

/** What `withoutUncountedBlocks` takes out, as it reports it. */
export type LeftOutBlock = { block: string; found: string };

/** Which email this was. Free text, like the rest of `audit_log`. */
export type ReportSurface = "daily_report" | "monthly_review";

export const LEFT_OUT_EVENT = "report_blocks_left_out";

/**
 * One line a person can read, from the block kinds and the figures.
 *
 * THE FIGURE IS NAMED, not just the block. "a stat block was left out"
 * sends somebody looking through a day's numbers; "a stat block, over
 * 7" is a search. The figures here are the ones NOBODY counted, so
 * printing them cannot be printing a number as if it were true — it is
 * quoting the thing that failed.
 */
export function leftOutSummary(surface: ReportSurface, day: string, removed: LeftOutBlock[]): string {
  const what = removed.map((r) => `${r.block} (over "${r.found}")`).join(", ");
  const n = removed.length;
  const which = surface === "monthly_review" ? "monthly review" : "daily report";
  const over = n === 1 ? "over a figure nothing declared" : "each over a figure nothing declared";
  return `${n} ${n === 1 ? "block was" : "blocks were"} left out of the ${which} for ${day}, ${over}: ${what}.`;
}

/**
 * Record it where the owner can find it, and say so if that fails.
 *
 * NOTHING HERE MAY BREAK A SEND. This is called after the email has
 * been built and before it goes out; a bookkeeping failure that stopped
 * the email would be a far worse fault than the one it is recording.
 * So it never throws, and it reports instead.
 */
export async function recordBlocksLeftOut(
  supabase: any,
  params: { dealershipId: string; surface: ReportSurface; day: string; removed: LeftOutBlock[] }
): Promise<{ recorded: boolean }> {
  if (!params.removed.length) return { recorded: false };

  const summary = leftOutSummary(params.surface, params.day, params.removed);
  // THE LOG LINE FIRST, because it is the one that cannot fail.
  console.error(`[growth] ${summary}`);

  const written = await logAuditEvent(supabase, {
    dealershipId: params.dealershipId,
    actor: `cron:${params.surface}`,
    eventType: LEFT_OUT_EVENT,
    summary,
    details: { surface: params.surface, day: params.day, blocks: params.removed },
  });

  if (!written?.ok) {
    // SAID, NOT SWALLOWED. logAuditEvent is best-effort by design — ten
    // call sites depend on it never throwing — and until today it threw
    // the reason away as well. It returns the reason now, and this is
    // the one place that has nothing to fall back on if the row is
    // missing.
    console.error(
      `[growth] and that record could not be written to audit_log, so the line above is the only copy: ${written?.error ?? "no reason given"}`
    );
    return { recorded: false };
  }
  return { recorded: true };
}
