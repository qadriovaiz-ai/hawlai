// P1 19b — dead-letter detection for pending_approvals. Nothing
// before this ever surfaced a request sitting unactioned for days —
// it just aged silently in the queue. approval_pending has been a
// reserved NotificationKind since migration 106 but was never
// actually emitted anywhere until this.

import { emitNotification } from "../notifications/emit";
import { humanizeActionType } from "../approvalLabels";
import { formatCurrency } from "../utils";

const STALE_THRESHOLD_HOURS = 48;

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

  return { staleCount: (stale ?? []).length };
}
