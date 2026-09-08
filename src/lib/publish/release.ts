// The handoff: a recorded human approval → a running publish action.
//
// THIS IS THE STEP THAT WAS MISSING. The approve route wrote
// pending_approvals.status = 'approved' and called the executor, but
// nothing anywhere moved publish_actions.status off 'awaiting_approval'
// — so the executor's first precondition refused every action, and the
// merchant was told "Approved, but the change couldn't be applied:
// Action is 'awaiting_approval', not approved."
//
// The 'approved' state was not merely unset; it was UNREACHABLE.
// create.ts writes it only under `if (!policy.requiresApproval)`, and
// every publish action is in ALWAYS_REQUIRES_APPROVAL. So that branch
// is dead for all five action keys and the executor had never once run
// to completion in production.
//
// It lives here rather than inline in the route for one reason: as
// route code it could only be tested by mocking the handoff, which is
// what hid the bug. publishExecutor.test.ts starts every case from a
// fabricated status:'approved' row — a state the product cannot
// produce — so twelve green tests said nothing about whether anything
// could ever reach the executor. A seam needs to be a unit before it
// can have a test.

import { executePublishAction, type ExecutorDeps, type ExecutionOutcome } from "./executor";
import { publishLog } from "./log";

export type ReleaseResult =
  /** This approval has no publish action — an ad budget change, say. Not an error. */
  | { kind: "not_a_publish_action" }
  | { kind: "ran"; actionId: string; outcome: ExecutionOutcome };

/**
 * Move an approved action into the executor.
 *
 * Call ONLY after pending_approvals.status is already 'approved'. The
 * executor re-verifies that record rather than trusting the action's
 * own column, so releasing any earlier means it refuses its own
 * approval — the ordering the route documents and depends on.
 */
export async function releaseApprovedAction(deps: ExecutorDeps, approvalId: string): Promise<ReleaseResult> {
  const { supabase } = deps;
  const now = deps.now ?? Date.now;

  const { data: action } = await supabase
    .from("publish_actions")
    .select("id, status")
    .eq("approval_id", approvalId)
    .maybeSingle();

  if (!action) return { kind: "not_a_publish_action" };

  // CONDITIONAL, and the filter is load-bearing rather than defensive.
  //
  // Unconditional, a second approval of an already-executed action
  // would flip 'executed' back to 'approved' and run it again — a live
  // price written to the merchant's store twice off one decision. The
  // route has no already-approved guard, and the inline card's state
  // is local to the component, so a page reload genuinely does offer
  // the button again.
  //
  // Matching only 'awaiting_approval' also leaves a crash between this
  // write and the execute call recoverable: the row is already
  // 'approved', this update matches nothing, and the executor below
  // still picks it up.
  const { data: released } = await supabase
    .from("publish_actions")
    .update({ status: "approved", updated_at: new Date(now()).toISOString() })
    .eq("id", action.id)
    .eq("status", "awaiting_approval")
    .select("id")
    .maybeSingle();

  publishLog("release", {
    action: action.id,
    approval: approvalId,
    was: action.status,
    transitioned: Boolean(released),
  });

  // The executor re-reads the row and is the single authority on
  // whether it is runnable. Deliberately NOT short-circuited here when
  // the transition did not match: duplicating the state machine is how
  // the two halves drift, and its own precondition already produces an
  // accurate message for every status it refuses.
  const outcome = await executePublishAction(deps, action.id);
  return { kind: "ran", actionId: action.id, outcome };
}
