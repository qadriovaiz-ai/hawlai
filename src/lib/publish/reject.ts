// A rejected approval must end its publish action.
//
// WHY: rejecting only ever wrote pending_approvals.status = 'rejected'.
// The publish action stayed 'awaiting_approval'. Nothing anywhere set
// it to 'rejected', even though the status type allows it and create.ts
// treats it as finished. So the next identical request matched the
// undecided-looking row and re-served its stored preview. That is how
// a card computed before the budget fix ("₹0.00/day") came back after
// the person had rejected it, looking brand new.
//
// A unit rather than route code, for the same reason as release.ts:
// the seam has to be testable without mocking the handoff away.

import { publishLog, publishError } from "./log";

/** Statuses that mean nobody has decided yet. */
const UNDECIDED = ["draft", "previewed", "awaiting_approval"];

export type RejectResult =
  /** This approval has no publish action (a legacy ad budget change, say). Not an error. */
  | { kind: "not_a_publish_action" }
  | { kind: "rejected"; actionId: string }
  | { kind: "error"; detail: string };

export async function rejectPublishAction(supabase: any, approvalId: string): Promise<RejectResult> {
  // Conditional, like release.ts: an action that already executed or
  // failed keeps that status. Rejecting a card for work that already
  // happened must not rewrite what happened.
  const { data, error } = await supabase
    .from("publish_actions")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("approval_id", approvalId)
    .in("status", UNDECIDED)
    .select("id");

  if (error) {
    publishError("reject.not_recorded", { approval: approvalId, detail: error.message });
    return { kind: "error", detail: error.message };
  }
  const row = (data ?? [])[0];
  if (!row) return { kind: "not_a_publish_action" };

  publishLog("reject", { action: row.id, approval: approvalId });
  return { kind: "rejected", actionId: row.id };
}
