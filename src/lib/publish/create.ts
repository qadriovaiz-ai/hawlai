// draft → preview → request approval.
//
// The half that makes the executor reachable. Nothing calls this yet:
// the Master Chat tool definition is the next piece and is deliberately
// not wired, so this can be read on its own first.
//
// WHAT IT DOES NOT DO, and the boundary is deliberate: it does not
// resolve "the blue kurta" to a variant id. Resolution needs to be
// able to ask a person "which one did you mean?", which is a
// conversational concern, and burying it here would mean either
// guessing or failing where a question was the right answer. This
// function takes an ALREADY-RESOLVED target and refuses without one.

import crypto from "crypto";
import { getActionPolicy } from "@/lib/executionPolicy";
import type { PublishPlatform, ActionKey, PlatformId, PreviewDiff } from "./types";
import { toRecord } from "./executor";

export type CreateInput = {
  dealershipId: string;
  platform: PlatformId;
  actionKey: ActionKey;
  /** Platform-native id, already resolved. Never a name. */
  targetRef: string;
  /** Human-readable, for an audit row that stays legible later. */
  targetLabel: string;
  requestedChanges: Record<string, unknown>;
  requestedBy: string | null;
};

export type CreateResult =
  | { ok: true; actionId: string; preview: PreviewDiff; approvalId: string | null; alreadyPending?: true }
  | { ok: false; reason: string };

/**
 * A stable fingerprint of the INTENT.
 *
 * Deterministic on purpose. Asking twice for the same change — a
 * double-tap, a retried message, an assistant repeating itself —
 * should surface the request already waiting rather than stack a
 * second identical approval on the owner. Two rows saying "set this
 * price to 999" is not two decisions; it is one decision and a
 * confusing queue.
 *
 * Excludes the requester: the same change asked for by two people is
 * still one change.
 */
export function intentKey(input: CreateInput): string {
  // Sorted keys so {price, sku} and {sku, price} fingerprint the same.
  const canonical = JSON.stringify(
    Object.keys(input.requestedChanges)
      .sort()
      .map((k) => [k, input.requestedChanges[k]])
  );
  return crypto
    .createHash("sha256")
    .update([input.platform, input.actionKey, input.targetRef, canonical].join("|"))
    .digest("hex")
    .slice(0, 32);
}

/** Statuses where an action is finished and a fresh request is legitimate. */
const TERMINAL = new Set(["executed", "failed", "rejected", "stale"]);

export async function createPublishAction(
  supabase: any,
  platform: PublishPlatform,
  input: CreateInput
): Promise<CreateResult> {
  const policy = getActionPolicy(input.actionKey);
  if (!policy) return { ok: false, reason: `No policy governs "${input.actionKey}".` };

  if (!platform.supports.includes(input.actionKey)) {
    // The capability model doing its job. Better here than as a
    // confusing failure after the owner has already approved.
    return { ok: false, reason: `${platform.id} cannot do "${input.actionKey}".` };
  }
  if (!input.targetRef) {
    return { ok: false, reason: "No target was specified — resolve the product before requesting a change." };
  }

  const key = intentKey(input);

  // Is this exact change already waiting? Checked BEFORE inserting so
  // the unique index is a backstop rather than the mechanism — an
  // index violation would surface as a database error to a merchant
  // who simply asked twice.
  const { data: existing } = await supabase
    .from("publish_actions")
    .select("id, status, preview, approval_id")
    .eq("dealership_id", input.dealershipId)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (existing && !TERMINAL.has(existing.status)) {
    return {
      ok: true,
      actionId: existing.id,
      preview: existing.preview,
      approvalId: existing.approval_id ?? null,
      alreadyPending: true,
    };
  }

  // A previous attempt for this same intent finished. The merchant is
  // entitled to ask again — a price they set last week is a fair thing
  // to set again — so the key is salted to clear the unique index.
  const idempotencyKey = existing ? `${key}:${Date.now().toString(36)}` : key;

  const { data: draft, error: insertError } = await supabase
    .from("publish_actions")
    .insert({
      dealership_id: input.dealershipId,
      platform: input.platform,
      action_key: input.actionKey,
      target_ref: input.targetRef,
      target_label: input.targetLabel,
      requested_changes: input.requestedChanges,
      status: "draft",
      idempotency_key: idempotencyKey,
      requested_by: input.requestedBy,
    })
    .select("*")
    .single();

  if (insertError || !draft) {
    return { ok: false, reason: insertError?.message ?? "Couldn't record the request." };
  }

  // PREVIEW READS THE PLATFORM. It can fail for ordinary reasons — the
  // product was deleted, the connection lapsed — and those are not
  // errors to hide. The draft is marked failed so the attempt stays
  // visible rather than vanishing.
  const preview = await platform.preview(toRecord(draft));
  if (!preview.ok) {
    await supabase.from("publish_actions").update({ status: "failed", error: preview.reason }).eq("id", draft.id);
    return { ok: false, reason: preview.reason };
  }

  await supabase
    .from("publish_actions")
    .update({ status: "previewed", preview: preview.preview, previewed_at: new Date().toISOString() })
    .eq("id", draft.id);

  // Every publish action requires approval — ACTION_POLICIES says so
  // unconditionally. The branch stays because the policy is the
  // authority, not this function's assumption about it.
  if (!policy.requiresApproval) {
    await supabase.from("publish_actions").update({ status: "approved" }).eq("id", draft.id);
    return { ok: true, actionId: draft.id, preview: preview.preview, approvalId: null };
  }

  const { data: approval, error: approvalError } = await supabase
    .from("pending_approvals")
    .insert({
      dealership_id: input.dealershipId,
      requested_by_agent: "publish",
      action_type: input.actionKey,
      // What the owner reads before deciding. The preview summary and
      // warnings, not a JSON patch — the person approving a price
      // change should not have to parse a diff to understand it.
      action_details: {
        summary: preview.preview.summary,
        target: input.targetLabel,
        changes: preview.preview.changes,
        warnings: preview.preview.warnings,
        publish_action_id: draft.id,
      },
      // NULL on purpose. A price change has no rupee amount, and
      // inventing one would feed the threshold logic a number that
      // means nothing. Null is what routes it to the critical
      // no-amount rule, which is where it belongs.
      amount: null,
    })
    .select("id")
    .single();

  if (approvalError || !approval) {
    await supabase
      .from("publish_actions")
      .update({ status: "failed", error: approvalError?.message ?? "Couldn't create the approval request." })
      .eq("id", draft.id);
    return { ok: false, reason: "Couldn't create the approval request." };
  }

  // Linked LAST. Until this write lands the action cannot be executed
  // — the executor refuses anything whose approval_id is missing — so
  // a crash between the two inserts leaves an orphan approval to be
  // rejected, never an action that can run unapproved.
  await supabase
    .from("publish_actions")
    .update({ status: "awaiting_approval", approval_id: approval.id })
    .eq("id", draft.id);

  return { ok: true, actionId: draft.id, preview: preview.preview, approvalId: approval.id };
}
