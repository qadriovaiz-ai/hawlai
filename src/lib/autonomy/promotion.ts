// EARNING THE RIGHT TO ACT ALONE — S7/P5.
//
// THE FOUNDER'S DECISION 2, 5 November 2026: promotion ASKS ONCE. The
// product gathers the evidence, decides whether it has earned the
// permission, and then raises an ordinary approval card with the numbers
// on it — "you have approved this 14 times without changing it, none
// were rejected, and the two we measured both improved. Shall I do this
// on my own from now on?"
//
// ONE CLICK, AND THE CLICK IS HIS. Nothing in this file writes
// `action_levels`; a test asserts that it never will. The row is written
// by /api/approvals/[id] when the owner presses Approve, which is the
// same path every other consequential decision takes. A product that
// widened its own permissions because a counter crossed a threshold is a
// different product from the one CLAUDE.md describes.
//
// THE EVIDENCE IS ROWS THAT ALREADY EXISTED. pending_approvals has
// carried status, reviewed_at and (since migration 127) modified_details
// all along; S5's decisions and outcomes carry whether the work helped.
// Nothing new is collected for this — S7's new collection (claim_checks)
// is for the DEMOTION side, which is the half that needed an instrument.
//
// AND FOUR READINGS WOULD EACH BE WRONG IN THE SAME DIRECTION:
//
//   a modification is not agreement. Migration 127 exists because the
//   owner sometimes approves Rs 3,000 where we asked for Rs 5,000.
//   Counting that as a yes is promoting on evidence of our own
//   inaccuracy.
//
//   an ignored card is not consent. A row nobody ever touched is him
//   not looking, and reading it as approval is the most dangerous
//   mistake available here.
//
//   `not_measurable` is not a pass. S5 made it a first-class verdict so
//   that "we could not tell" would stop being filed as "it was fine".
//
//   and evidence from before a demotion does not count. §9's rule: the
//   counter restarts, or an action demoted for a real escape is
//   re-promoted the same week on the approvals that preceded it.

import { PROMOTION_EVIDENCE, isAllowlistedForL2 } from "@/lib/autonomy/policy";
import { pinnedToL0 } from "@/lib/autonomyLevels";

/** What the rows say about one action, for one business. */
export type PromotionEvidence = {
  /** Approved exactly as asked. The only kind that counts for. */
  approvalsAsRequested: number;
  /** Approved with a change. Evidence of our inaccuracy, not of agreement. */
  modifications: number;
  rejections: number;
  /** Cards still sitting there, well past their day. Not consent. */
  ignored: number;
  /** How long this has been going on. Volume cannot buy time. */
  firstApprovalDaysAgo: number | null;
  /** Outcomes measured for this action: improved or unchanged. */
  measuredOutcomes: number;
  /** Outcomes that went the wrong way. One disqualifies. */
  worsened: number;
  /** Outcomes nobody could measure. Not a pass. */
  notMeasurable: number;
};

export type PromotionVerdict = { ok: boolean; why: string | null };

/**
 * Has this action, for this business, earned the right to run alone?
 *
 * PURE. No database, no clock, no model — the whole rule is readable in
 * one screen and testable without any of them.
 *
 * ELIGIBILITY FIRST, THEN EVIDENCE, so the reason is the most specific
 * true one: "it spends money" for an action no amount of evidence could
 * ever promote, rather than "not enough approvals yet".
 *
 * THE UNDO IS NOT CHECKED HERE. It is a property of the platform, not
 * of the evidence, and `proposePromotion` checks it with the real
 * registry — the same split `publish/create.ts` uses for L1.
 */
export function earnsL2(actionKey: string, evidence: PromotionEvidence): PromotionVerdict {
  const pinned = pinnedToL0(actionKey);
  if (pinned) return { ok: false, why: pinned };
  if (!isAllowlistedForL2(actionKey)) {
    return { ok: false, why: "it is not one of the actions that may ever run unattended" };
  }

  const e = evidence;
  if (e.rejections > PROMOTION_EVIDENCE.rejections) {
    return { ok: false, why: "you have turned this down before, so I will keep asking" };
  }
  if (e.modifications > PROMOTION_EVIDENCE.modifications) {
    return { ok: false, why: "you have changed what I asked for before approving it, so I am not getting this right on my own yet" };
  }
  if (e.ignored > 0) {
    // NOT A THRESHOLD. One card he never looked at means the approvals
    // this rests on are not a record of him reading them.
    return { ok: false, why: "some of these cards are still waiting for you, so I cannot read the rest as agreement" };
  }
  if (e.approvalsAsRequested < PROMOTION_EVIDENCE.approvalsAsRequested) {
    return { ok: false, why: "you have not approved this often enough yet for me to be sure" };
  }
  if (e.firstApprovalDaysAgo === null || e.firstApprovalDaysAgo < PROMOTION_EVIDENCE.days) {
    // VOLUME CANNOT BUY TIME. Forty approvals in three days is one
    // afternoon's enthusiasm, not a month of this working.
    return { ok: false, why: "this has not been going long enough yet for me to be sure" };
  }
  if (e.worsened > 0) {
    return { ok: false, why: "the last time this was measured it made things worse, so I will keep asking" };
  }
  if (e.measuredOutcomes < PROMOTION_EVIDENCE.measuredOutcomes) {
    // `notMeasurable` is deliberately not counted here. It is named in
    // the sentence so the owner knows the difference.
    return {
      ok: false,
      why: e.notMeasurable > 0
        ? "I could not measure what this changed, and I am not treating that as it having worked"
        : "nothing has been measured about this yet, so I have no evidence it helps",
    };
  }
  return { ok: true, why: null };
}

/** Whole days from an ISO timestamp to a day, or null if unreadable. */
function daysSince(at: string | null | undefined, today: string): number | null {
  const a = Date.parse(String(at ?? ""));
  const b = Date.parse(`${String(today).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/**
 * How long a card may sit before it counts as ignored rather than
 * pending.
 *
 * Not a policy number in the founder's list, so it is here rather than
 * in policy.ts: it is a reading of the same rows, not a rule he chose.
 * Generous on purpose — a card from this morning is not a card he is
 * refusing to look at.
 */
export const IGNORED_AFTER_DAYS = 7;

/**
 * Read the evidence out of the rows.
 *
 * BOUNDED BY THE LAST DEMOTION. Everything before it is evidence about
 * a version of this that was taken away, and re-promoting on it is the
 * ratchet §9 exists to prevent.
 *
 * NULL ON AN UNREADABLE READ, never a zeroed object. Zeroes read as
 * "not enough evidence", which is the safe direction for promotion — but
 * saying "I read the rows and there were none" when nothing could be
 * read is the instrument telling a false story, and this project has
 * paid for that more than once.
 */
export async function gatherEvidence(
  supabase: any,
  dealershipId: string,
  actionKey: string,
  today: string
): Promise<PromotionEvidence | null> {
  // WHEN WAS THIS LAST TAKEN AWAY? S7/P3 records every demotion as a
  // decision of kind 'automation_switched'.
  const { data: demotions, error: demotionError } = await supabase
    .from("decisions")
    .select("created_at")
    .eq("dealership_id", dealershipId)
    .eq("kind", "automation_switched")
    .order("created_at", { ascending: false })
    .limit(1);
  if (demotionError) {
    console.error(`[autonomy] could not read past demotions for ${dealershipId}, so nothing was proposed: ${demotionError.message}`);
    return null;
  }
  const since = Array.isArray(demotions) && demotions[0]?.created_at ? String(demotions[0].created_at) : null;

  let query = supabase
    .from("pending_approvals")
    .select("id, status, modified_details, reviewed_at, created_at")
    .eq("dealership_id", dealershipId)
    .eq("action_type", actionKey);
  if (since) query = query.gte("created_at", since);
  const { data: approvals, error } = await query;
  if (error || !Array.isArray(approvals)) {
    console.error(
      `[autonomy] could not read the approval history for ${actionKey}/${dealershipId}, so nothing was proposed: ${error?.message ?? "no rows returned"}`
    );
    return null;
  }

  const rows = approvals as Record<string, any>[];
  const asRequested = rows.filter((r) => r.status === "approved" && !r.modified_details);
  const evidence: PromotionEvidence = {
    approvalsAsRequested: asRequested.length,
    modifications: rows.filter((r) => r.status === "approved" && r.modified_details).length,
    rejections: rows.filter((r) => r.status === "rejected").length,
    ignored: rows.filter((r) => r.status === "pending" && (daysSince(r.created_at, today) ?? 0) > IGNORED_AFTER_DAYS).length,
    firstApprovalDaysAgo: asRequested
      .map((r) => daysSince(r.created_at, today))
      .filter((d): d is number => d !== null)
      .reduce<number | null>((oldest, d) => (oldest === null || d > oldest ? d : oldest), null),
    measuredOutcomes: 0,
    worsened: 0,
    notMeasurable: 0,
  };

  // DID IT HELP? S5's outcome rows, reached through the decisions that
  // point at these approvals. `decisions.why` carries evidence pointers
  // in the shape opportunities.evidence has used since migration 210,
  // so the link is `{ kind: "approval", id }`.
  const approvalIds = new Set(rows.map((r) => String(r.id)));
  if (approvalIds.size) {
    const { data: decisions, error: decisionError } = await supabase
      .from("decisions")
      .select("id, why")
      .eq("dealership_id", dealershipId)
      .eq("kind", "approval_granted");
    if (decisionError) {
      console.error(`[autonomy] could not read decisions for ${dealershipId}, so nothing was proposed: ${decisionError.message}`);
      return null;
    }
    const mine = (Array.isArray(decisions) ? decisions : []).filter((d: any) =>
      (Array.isArray(d.why) ? d.why : []).some((w: any) => approvalIds.has(String(w?.id)))
    );
    if (mine.length) {
      const { data: outcomes, error: outcomeError } = await supabase
        .from("outcomes")
        .select("verdict")
        .in("decision_id", mine.map((d: any) => d.id));
      if (outcomeError) {
        console.error(`[autonomy] could not read outcomes for ${dealershipId}, so nothing was proposed: ${outcomeError.message}`);
        return null;
      }
      for (const o of Array.isArray(outcomes) ? outcomes : []) {
        const verdict = String((o as any).verdict ?? "");
        if (verdict === "worsened") evidence.worsened += 1;
        else if (verdict === "not_measurable") evidence.notMeasurable += 1;
        else if (verdict === "improved" || verdict === "unchanged") evidence.measuredOutcomes += 1;
      }
    }
  }

  return evidence;
}

/**
 * Does this action's platform know how to put a change back?
 *
 * ASKED OF THE REGISTRY, not assumed. L2's justification is the same as
 * L1's plus the evidence, and `publish/create.ts` resolves this the same
 * way: `typeof platform.undo === "function"`. Today only hawlaiSite
 * implements it.
 */
export async function undoExistsFor(supabase: any, actionKey: string): Promise<boolean> {
  try {
    const { createPlatformRegistry } = await import("@/lib/publish/registry");
    const registry = createPlatformRegistry(supabase);
    for (const platform of Object.values(registry)) {
      if (!platform) continue;
      // COMPARED AS STRINGS, because this function is asked about an
      // ACTION_POLICIES key and `supports` is typed as the narrower
      // publish ActionKey. Casting the key INTO that type would be
      // claiming it is one; comparing the other way round asks the
      // honest question — "does any platform claim this key" — and
      // answers false for a key no platform has.
      if ((platform.supports as readonly string[]).includes(actionKey)) return typeof platform.undo === "function";
    }
  } catch (err: any) {
    console.error(`[autonomy] could not read the publish registry for ${actionKey}: ${err?.message ?? err}`);
  }
  // NO PLATFORM CLAIMS IT, SO NOTHING CAN PUT IT BACK. The safe
  // direction, and the same reading `canHoldL1` gives a missing undo.
  return false;
}

export type Proposal =
  | { proposed: true; approvalId: string; evidence: PromotionEvidence }
  | { proposed: false; why: string };

/**
 * Ask the owner, once, with the numbers on the card.
 *
 * WHAT THIS DOES NOT DO: write a level. The card is the proposal; the
 * row is written by /api/approvals/[id] when he presses Approve.
 * tests/autonomyPromotion.test.ts asserts no write to `action_levels`
 * appears in this file.
 *
 * AND IT DOES NOT ASK TWICE. A pending `grant_autonomy` card for this
 * action is already the question, and a second one would be the product
 * nagging for a permission.
 */
export async function proposePromotion(
  supabase: any,
  dealershipId: string,
  actionKey: string,
  today: string
): Promise<Proposal> {
  const { canHoldL2 } = await import("@/lib/autonomyLevels");
  const hasUndo = await undoExistsFor(supabase, actionKey);
  const eligible = canHoldL2(actionKey, { hasUndo });
  if (!eligible.ok) return { proposed: false, why: eligible.why ?? "this action cannot run unattended" };

  const evidence = await gatherEvidence(supabase, dealershipId, actionKey, today);
  if (!evidence) return { proposed: false, why: "the record could not be read, so nothing was proposed" };

  const earned = earnsL2(actionKey, evidence);
  if (!earned.ok) return { proposed: false, why: earned.why ?? "not yet" };

  // ALREADY ASKED? One pending card is the question; a second is
  // nagging. Checked before the insert rather than deduplicated after,
  // because the owner would see both.
  const { data: asked, error: askedError } = await supabase
    .from("pending_approvals")
    .select("id")
    .eq("dealership_id", dealershipId)
    .eq("action_type", "grant_autonomy")
    .eq("status", "pending");
  if (askedError) return { proposed: false, why: `could not check whether this was already asked: ${askedError.message}` };
  const pending = (Array.isArray(asked) ? asked : []) as Record<string, any>[];
  if (pending.length) return { proposed: false, why: "you already have this question waiting on your Tasks page" };

  // ALSO ALREADY GRANTED? A level at L2 does not need asking for.
  const { readStoredLevel } = await import("@/lib/autonomyLevelsStore");
  if ((await readStoredLevel(supabase, dealershipId, actionKey)) === "L2") {
    return { proposed: false, why: "this already runs on its own" };
  }

  const { requestApproval } = await import("@/lib/chat/requestApproval");
  const result = await requestApproval(supabase, dealershipId, {
    actionType: "grant_autonomy",
    // THE ACTION BEING GRANTED TRAVELS ON THE ROW, and the route
    // re-checks it against the allowlist rather than trusting it. A
    // stored action_details is still a value the server should not act
    // on blindly — the lesson the toggle branch records.
    details: { action_key: actionKey, evidence },
    confirm: confirmFor(actionKey, evidence),
    requestedBy: "system:autonomy",
  });
  if ("error" in result) return { proposed: false, why: result.error };
  return { proposed: true, approvalId: result.approvalId, evidence };
}

/**
 * The sentence on the card.
 *
 * THE NUMBERS ARE ON IT, which is the whole of the founder's decision
 * 2. "Shall I do this on my own?" with no figures is a question he
 * cannot answer, and every figure here is a count of his own rows — no
 * forecast, nothing derived.
 *
 * AND IT NEVER SAYS "L2". He is not choosing a letter; he is deciding
 * whether something happens without him.
 */
export function confirmFor(actionKey: string, evidence: PromotionEvidence): string {
  const n = evidence.approvalsAsRequested;
  const days = evidence.firstApprovalDaysAgo ?? 0;
  const measured = evidence.measuredOutcomes;
  const what = humanActionName(actionKey);
  const measuredPart =
    measured === 1
      ? "and the one time I could measure the result, it did not go backwards"
      : `and the ${measured} times I could measure the result, none went backwards`;
  return (
    `You have approved "${what}" ${n} times over ${days} days without changing what I asked for, ` +
    `none were turned down, ${measuredPart}. ` +
    `Shall I start doing this on my own? I will tell you every time I do, and I will stop and ask again the moment anything I publish does not match your records.`
  );
}

/** What the owner calls the thing, not what the registry calls it. */
function humanActionName(actionKey: string): string {
  const NAMES: Record<string, string> = {
    update_page_meta: "change a page's search title and description",
  };
  return NAMES[actionKey] ?? actionKey.replace(/_/g, " ");
}
