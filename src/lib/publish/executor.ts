// Claim → execute → record. The only thing that runs a publish action.
//
// FOR REVIEW. Nothing schedules this yet — no cron entry, no route. It
// is the machine; wiring it to a trigger is the next decision.
//
// THREE PROPERTIES THIS HAS TO GET RIGHT, and they are the reason it
// is not a for-loop over approved rows:
//
//   1. It re-verifies the APPROVAL, not just the action's own status.
//   2. Exactly one worker executes a given action.
//   3. A crash mid-execute must not wedge an action forever.

import { getActionPolicy } from "@/lib/executionPolicy";
import type { PublishPlatform, PublishActionRecord, PublishStatus } from "./types";

/** How long a claim is honoured before another worker may take it over. */
export const CLAIM_TTL_MS = 5 * 60 * 1000;

export type ExecutionOutcome =
  | { status: "executed"; platformResponse: unknown }
  | { status: "stale"; changed: unknown }
  | { status: "failed"; error: string }
  /** Not claimed — another worker holds it, or it was not ours to run. */
  | { status: "skipped"; reason: string };

type Row = Record<string, any>;

/** DB row → the shape platforms consume. One place, so field names cannot drift. */
export function toRecord(row: Row): PublishActionRecord {
  return {
    id: row.id,
    dealershipId: row.dealership_id,
    platform: row.platform,
    connectionRef: row.connection_ref ?? null,
    actionKey: row.action_key,
    targetRef: row.target_ref ?? null,
    targetLabel: row.target_label ?? null,
    requestedChanges: row.requested_changes ?? {},
    preview: row.preview ?? null,
    previewedAt: row.previewed_at ?? null,
    status: row.status as PublishStatus,
    idempotencyKey: row.idempotency_key,
    resolutionPath: row.resolution_path ?? null,
  };
}

/**
 * Whether this action is genuinely cleared to run.
 *
 * THE GATE, RE-CHECKED. publish_actions.status = 'approved' is a
 * claim; pending_approvals is the evidence. Trusting the former alone
 * means anything that can write that column can bypass the approval
 * system entirely — a bug, a migration, a well-meaning admin script.
 *
 * The whole product promise is that a price change cannot go live
 * without a human saying yes, so the executor asks the approval
 * record directly rather than believing a status field.
 */
export function isClearedToExecute(action: Row, approval: Row | null): { cleared: boolean; reason?: string } {
  const policy = getActionPolicy(action.action_key);
  if (!policy) return { cleared: false, reason: `Unknown action "${action.action_key}" — no policy governs it.` };

  if (!policy.requiresApproval) return { cleared: true };

  if (!action.approval_id) {
    return { cleared: false, reason: `${action.action_key} requires approval but has no approval record.` };
  }
  if (!approval) {
    return { cleared: false, reason: "The approval record is missing." };
  }
  if (approval.status !== "approved") {
    return { cleared: false, reason: `The approval is "${approval.status}", not approved.` };
  }
  return { cleared: true };
}

export interface ExecutorDeps {
  supabase: any;
  /** Platform modules by id. A platform absent here simply cannot run. */
  platforms: Partial<Record<string, PublishPlatform>>;
  now?: () => number;
}

/**
 * Run one approved action.
 *
 * Every exit records a terminal state, so an action can never sit in
 * 'executing' because a branch forgot to write. That is the failure
 * mode that makes an operator distrust the whole table.
 */
export async function executePublishAction(deps: ExecutorDeps, actionId: string): Promise<ExecutionOutcome> {
  const { supabase } = deps;
  const now = deps.now ?? Date.now;

  const { data: action } = await supabase
    .from("publish_actions")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();

  if (!action) return { status: "skipped", reason: "No such action." };
  if (action.status !== "approved") {
    // Includes anything already executing, executed or failed —
    // re-running a finished action is exactly what must not happen.
    return { status: "skipped", reason: `Action is "${action.status}", not approved.` };
  }

  // Re-verify the approval BEFORE claiming, so a forged status cannot
  // even take the lock.
  let approval: Row | null = null;
  if (action.approval_id) {
    const { data } = await supabase
      .from("pending_approvals")
      .select("id, status")
      .eq("id", action.approval_id)
      .maybeSingle();
    approval = data ?? null;
  }

  const cleared = isClearedToExecute(action, approval);
  if (!cleared.cleared) {
    await finish(supabase, actionId, "failed", { error: cleared.reason });
    return { status: "failed", error: cleared.reason! };
  }

  // CLAIM. A conditional UPDATE is the mutex: only one worker's update
  // can match, and Postgres serialises them at row level. Same shape
  // as the Shopify refresh lock and for the same reason — Supabase
  // pools connections, so a session-scoped advisory lock is
  // unreliable and pg_advisory_xact_lock needs a transaction
  // supabase-js does not expose.
  //
  // The staleness window lets a worker that crashed mid-execute be
  // taken over, so a crash costs one TTL rather than the action.
  const staleClaim = new Date(now() - CLAIM_TTL_MS).toISOString();
  const { data: claimed } = await supabase
    .from("publish_actions")
    .update({ status: "executing", updated_at: new Date(now()).toISOString() })
    .eq("id", actionId)
    .or(`status.eq.approved,and(status.eq.executing,updated_at.lt.${staleClaim})`)
    .select("id")
    .maybeSingle();

  if (!claimed) return { status: "skipped", reason: "Another worker is already executing this action." };

  const platform = deps.platforms[action.platform];
  if (!platform) {
    await finish(supabase, actionId, "failed", { error: `No platform module for "${action.platform}".` });
    return { status: "failed", error: `No platform module for "${action.platform}".` };
  }

  let result;
  try {
    result = await platform.execute(toRecord(action));
  } catch (err: any) {
    // A platform that throws must not leave the row in 'executing'.
    // Every other worker would then skip it until the TTL lapses, and
    // the reason would be nowhere.
    const error = `Platform threw: ${err?.message ?? String(err)}`;
    await finish(supabase, actionId, "failed", { error });
    return { status: "failed", error };
  }

  if (result.ok) {
    await finish(supabase, actionId, "executed", {
      platform_response: result.platformResponse ?? null,
      executed_at: new Date(now()).toISOString(),
    });
    return { status: "executed", platformResponse: result.platformResponse };
  }

  if (result.stale) {
    // NOT a failure. The world moved between preview and execution,
    // nothing was written, and the right next step is a fresh preview
    // and a fresh decision — not a retry of a decision that no longer
    // describes reality.
    await finish(supabase, actionId, "stale", {
      error: "The item changed after this was approved, so nothing was applied.",
      platform_response: { changed: result.changed },
    });
    return { status: "stale", changed: result.changed };
  }

  await finish(supabase, actionId, "failed", { error: result.reason });
  return { status: "failed", error: result.reason };
}

async function finish(supabase: any, actionId: string, status: PublishStatus, fields: Record<string, unknown>) {
  await supabase.from("publish_actions").update({ status, ...fields }).eq("id", actionId);
}
