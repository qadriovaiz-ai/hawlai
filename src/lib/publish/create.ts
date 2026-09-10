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
import type { ResolutionPath, ResolutionDetail } from "./resolve";
import { toRecord } from "./executor";
import { publishLog, publishError } from "./log";

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
  /**
   * How targetRef was arrived at. Recorded so that, if the wrong
   * product is repriced, the row can answer "how did it pick that
   * one?" — a question the preview alone cannot settle after the fact.
   */
  resolutionPath?: ResolutionPath;
  resolutionDetail?: ResolutionDetail;
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

/** Nobody has decided yet. The only statuses this file may close. */
const UNDECIDED = ["draft", "previewed", "awaiting_approval"];

type Row = Record<string, any>;

type Verdict =
  | { kind: "reuse"; preview: PreviewDiff }
  | { kind: "retired" }
  | { kind: "error"; reason: string };

const CANT_CHECK = "I couldn't check whether your earlier request is still waiting. Nothing was changed — try again in a moment.";

function sameChanges(a: PreviewDiff["changes"] | undefined, b: PreviewDiff["changes"] | undefined): boolean {
  const flat = (cs: PreviewDiff["changes"] | undefined) => JSON.stringify((cs ?? []).map((c) => [c.field, c.before ?? null, c.after]));
  return flat(a) === flat(b);
}

/**
 * May this waiting action be shown to the person again?
 *
 * WHY THIS EXISTS: re-serving a waiting action used to return its
 * stored preview untouched. A card for a ₹100/day campaign read
 * "₹0.00/day", computed by preview code that had since been fixed, and
 * it kept coming back: after it was rejected, because a rejection never
 * reached publish_actions (reject.ts), and while it was still pending,
 * because nothing re-read the platform. An approval card must show
 * what is true now, not what was true when it was first drawn.
 */
async function checkWaiting(supabase: any, platform: PublishPlatform, row: Row): Promise<Verdict> {
  if (row.approval_id) {
    const { data: approval, error } = await supabase
      .from("pending_approvals")
      .select("status")
      .eq("id", row.approval_id)
      .maybeSingle();
    // Can't tell whether it was decided: neither re-serve a possibly
    // decided card nor stack a second one beside it.
    if (error) return { kind: "error", reason: CANT_CHECK };

    // Approved and released: the executor owns it. "Already in
    // progress" is true, and there is nothing to re-decide.
    if (approval?.status === "approved") return { kind: "reuse", preview: row.preview };

    if (approval?.status !== "pending") {
      // Rejected, or the approval row is gone. Before reject.ts a
      // rejection never reached publish_actions, so production holds
      // rows exactly like this. Closed here so they stop resurfacing.
      const { error: closeError } = await supabase
        .from("publish_actions")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .in("status", UNDECIDED);
      if (closeError) return { kind: "error", reason: CANT_CHECK };
      publishLog("create.closed_rejected", { action: row.id, approval: row.approval_id });
      return { kind: "retired" };
    }
  }

  // Genuinely waiting. Re-read the platform: only an unchanged preview
  // is shown again.
  const fresh = await platform.preview(toRecord(row));
  if (!fresh.ok) return { kind: "error", reason: fresh.reason };
  if (sameChanges(fresh.preview.changes, row.preview?.changes)) return { kind: "reuse", preview: row.preview };

  // Out of date. Retire it, so the queue never holds two decisions for
  // one intent and the old values can't be approved later.
  const at = new Date().toISOString();
  const { error: staleError } = await supabase
    .from("publish_actions")
    .update({ status: "stale", updated_at: at })
    .eq("id", row.id)
    .in("status", UNDECIDED);
  if (staleError) return { kind: "error", reason: CANT_CHECK };
  if (row.approval_id) {
    const { error: approvalError } = await supabase
      .from("pending_approvals")
      .update({
        status: "rejected",
        reviewed_at: at,
        rejection_reason: "Superseded: the details changed before anyone decided, so a fresh request replaced it.",
      })
      .eq("id", row.approval_id)
      .eq("status", "pending");
    if (approvalError) return { kind: "error", reason: CANT_CHECK };
  }
  publishError("create.superseded", {
    action: row.id,
    approval: row.approval_id ?? null,
    was: JSON.stringify(row.preview?.changes ?? []).slice(0, 200),
    now: JSON.stringify(fresh.preview.changes).slice(0, 200),
  });
  return { kind: "retired" };
}

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

  // Is this change already waiting? Checked BEFORE inserting so the
  // unique index is a backstop rather than the mechanism — an index
  // violation would surface as a database error to a merchant who
  // simply asked twice.
  //
  // Every earlier attempt at this intent: the original key AND its
  // salted repeats. The lookup used to match the exact key only, so
  // once one attempt finished, every later repeat was salted and never
  // matched again — asking twice after a rejection stacked two
  // approvals for one decision.
  const { data: earlier, error: earlierError } = await supabase
    .from("publish_actions")
    .select("*")
    .eq("dealership_id", input.dealershipId)
    .like("idempotency_key", `${key}%`);
  if (earlierError) {
    return { ok: false, reason: "I couldn't check for an earlier copy of this request. Nothing was changed — try again in a moment." };
  }
  // Newest first, sorted here rather than by the query so this does not
  // depend on a column the table might not have.
  const attempts: Row[] = [...(earlier ?? [])].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

  // A row is only genuinely "already waiting" if it HAS a preview. A
  // draft is non-terminal but has none — returning it would hand the
  // caller preview: null, and every field read off it throws. That is
  // a crash on a path nobody exercises until two requests collide.
  const waiting = attempts.find((r) => !TERMINAL.has(r.status) && r.preview) ?? null;
  if (waiting) {
    const verdict = await checkWaiting(supabase, platform, waiting);
    if (verdict.kind === "error") return { ok: false, reason: verdict.reason };
    if (verdict.kind === "reuse") {
      return {
        ok: true,
        actionId: waiting.id,
        preview: verdict.preview,
        approvalId: waiting.approval_id ?? null,
        alreadyPending: true,
      };
    }
    // "retired": it was rejected or out of date, and is now closed.
    // Fall through to a fresh request.
  }

  // A previous attempt for this same intent exists — finished, retired
  // just now, or an abandoned previewless draft. The merchant is
  // entitled to ask again, so the key is salted to clear the unique
  // index.
  const idempotencyKey = attempts.length > 0 ? `${key}:${Date.now().toString(36)}` : key;

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
      resolution_path: input.resolutionPath ?? null,
      resolution_detail: input.resolutionDetail ?? null,
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
  publishLog("create.draft", { action: draft.id, dealership: input.dealershipId, key: input.actionKey, target: input.targetRef, path: input.resolutionPath ?? null });

  const preview = await platform.preview(toRecord(draft));
  if (!preview.ok) {
    publishError("create.preview_failed", { action: draft.id, detail: preview.reason });
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
        // Surfaced to the approver, not just stored. "You picked this
        // from five" and "this was the only match" are different
        // levels of confidence, and the person saying yes is entitled
        // to know which one they are looking at.
        resolution_path: input.resolutionPath ?? null,
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

  publishLog("create.awaiting_approval", { action: draft.id, approval: approval.id, summary: preview.preview.summary, warnings: preview.preview.warnings.length });
  return { ok: true, actionId: draft.id, preview: preview.preview, approvalId: approval.id };
}
