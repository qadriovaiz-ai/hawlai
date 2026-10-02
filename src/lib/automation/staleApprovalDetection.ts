// P1 19b — dead-letter detection for pending_approvals. Nothing
// before this ever surfaced a request sitting unactioned for days —
// it just aged silently in the queue. approval_pending has been a
// reserved NotificationKind since migration 106 but was never
// actually emitted anywhere until this.

import { emitNotification } from "../notifications/emit";
import { humanizeActionType } from "../approvalLabels";
import { formatCurrency } from "../utils";

const STALE_THRESHOLD_HOURS = 48;

/**
 * After this long with nobody deciding, the request is closed.
 *
 * WHY IT NEEDS TO CLOSE AT ALL. Notifying was the whole of this file:
 * after two days the owner was told, and then the row sat pending
 * forever. One card on a live account has been waiting since September,
 * and a card from weeks ago is not a decision anybody still wants to
 * take — the price it quotes has moved, the campaign it names may be
 * finished. Approving it would apply yesterday's intent to today's
 * business, which is the same staleness the publish executor already
 * refuses one step later.
 *
 * Fourteen days: long enough that a holiday does not lose work, short
 * enough that the queue means something.
 */
const EXPIRE_AFTER_DAYS = 14;

export async function checkStalePendingApprovals(supabase: any, dealershipId: string) {
  const threshold = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from("pending_approvals")
    .select("id, action_type, amount, created_at")
    .eq("dealership_id", dealershipId)
    .eq("status", "pending")
    .lt("created_at", threshold);

  for (const approval of stale ?? []) {
    await emitNotification(supabase, {
      dealershipId,
      kind: "approval_pending",
      title: `An approval has been waiting ${STALE_THRESHOLD_HOURS}+ hours`,
      body: `${humanizeActionType(approval.action_type)}${approval.amount ? ` — ${formatCurrency(approval.amount)}` : ""} still needs a decision.`,
      href: "/dashboard/approvals",
      // Stable per-approval, not time-bucketed — fires once when it
      // first crosses the threshold, not a daily repeat reminder for
      // the same request.
      dedupeKey: `stale_approval:${approval.id}`,
    });
  }

  const expired = await expireOldApprovals(supabase, dealershipId);
  return { staleCount: (stale ?? []).length, expired };
}

/**
 * Close the requests nobody decided, and the publish actions behind them.
 *
 * The action goes to 'stale' rather than 'failed': nothing was attempted
 * and nothing went wrong — the decision simply aged out, which is the
 * word publish_actions already uses for an intent overtaken by time.
 *
 * Both writes are status values their tables' CHECK constraints allow:
 * 'expired' was added to pending_approvals by migration 207, and
 * publish_actions has allowed 'stale' since 170. Writing one they did not
 * allow is exactly how propose_page_meta failed on its first insert.
 */
export async function expireOldApprovals(supabase: any, dealershipId: string, now: number = Date.now()): Promise<number> {
  const cutoff = new Date(now - EXPIRE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: old } = await supabase
    .from("pending_approvals")
    .select("id")
    .eq("dealership_id", dealershipId)
    .eq("status", "pending")
    .lt("created_at", cutoff);

  const ids = (old ?? []).map((a: { id: string }) => a.id);
  if (ids.length === 0) return 0;

  // The approval first: until it stops being 'pending' the executor can
  // still be handed it, and an action marked stale beside a live
  // approval is the worse of the two orders to be interrupted in.
  const { error } = await supabase
    .from("pending_approvals")
    .update({ status: "expired", reviewed_at: new Date(now).toISOString(), rejection_reason: `Nobody decided within ${EXPIRE_AFTER_DAYS} days, so this closed itself. Ask again and Hawlai will rebuild it against today's figures.` })
    .in("id", ids);
  if (error) {
    console.error("[stale-approvals] couldn't expire:", error.message);
    return 0;
  }

  await supabase.from("publish_actions").update({ status: "stale", updated_at: new Date(now).toISOString() }).in("approval_id", ids).eq("status", "awaiting_approval");
  return ids.length;
}
