// AUTONOMY LEVELS — C6, the half of the rulebook that does not exist yet.
//
// S3/P0. `executionPolicy.ts` answers "what kind of action is this and
// how risky", and `approvalAuthority.ts` answers "may THIS person
// approve it". Neither answers "does this business still need to be
// asked at all", and that is what a level is.
//
//   L0  Nothing happens until a human approves that specific instance.
//       A pending_approvals row every time. The default, and the only
//       level anything has today.
//   L1  Acts on the owner's own chat instruction, with no second
//       approval click - BECAUSE IT IS REVERSIBLE. The before-state is
//       stored, the audit row is written, and an undo exists.
//
// L2 - running unattended, with nobody instructing it - IS NOT IN THIS
// FILE AND NOT IN THE DATABASE. The founder's position, 22 October
// 2026: it waits for S5's outcome loop, because his rule is "kabhi
// nuksaan na ho, sirf growth" and that proof only comes from
// measurement, which does not exist yet. Migration 209's CHECK allows
// 'L0' and 'L1' only, so a row cannot even express L2 until a later
// migration widens it - the same shape as publish_actions.platform,
// which is widened per platform as each one is actually implemented.
//
// THE DANGEROUS DIRECTION IS UP. Everything here is written so that
// every unclear case resolves DOWNWARD to L0: a missing row, an
// unknown action, an action whose platform cannot undo itself. The
// header of ACTION_POLICIES already says absence is not "safe by
// default", and this inherits that reading rather than restating it.

import { getActionPolicy, type ActionType, type RiskLevel } from "@/lib/executionPolicy";

export type AutonomyLevel = "L0" | "L1";

/** No row means ask. Absence is never permission. */
export const DEFAULT_LEVEL: AutonomyLevel = "L0";

/**
 * Action types that can never be raised above L0, whatever a row says.
 *
 * `spend` is the founder's standing rule and CLAUDE.md rule 6's
 * subject: money is always a human decision. `delete` is here because
 * an undo cannot restore what no longer exists, and L1's entire
 * justification is that the change is reversible.
 */
const PINNED_ACTION_TYPES: ActionType[] = ["spend", "delete"];

/**
 * Risk levels that can never be raised above L0.
 *
 * `critical` in this codebase means the consequence cannot be taken
 * back by us at all - a placed phone call, a public post. AUTOMATION_
 * TOGGLES' own comment puts it plainly: "a public post cannot be unseen
 * any more than a placed call can be unplaced." An undo method cannot
 * make those reversible, so no row may claim they are.
 */
const PINNED_RISK_LEVELS: RiskLevel[] = ["critical"];

export type LevelInputs = {
  /** What `action_levels` holds for this business and action, if anything. */
  stored?: AutonomyLevel | null;
  /**
   * Does this action's platform implement `undo()`?
   *
   * INJECTED RATHER THAN LOOKED UP, because the publish registry gains
   * `undo()` in P1 and this file is P0. Passing it in keeps the
   * dependency visible instead of making P0 quietly depend on work that
   * has not happened; P1 wires the registry into the caller, not here.
   */
  hasUndo: boolean;
  /**
   * Which way an automation is being moved, when that is what is
   * happening.
   *
   * CLAUDE.md rule 6: "Switching an automation off is never gated - the
   * safe direction must not be the slow one." masterBrainV2's toggle
   * path already honours this (`if (!input.enabled)` writes straight to
   * the row), and a level must not be able to undo that. So "disable"
   * never consults a stored level at all.
   */
  direction?: "enable" | "disable" | null;
};

/** Why an action may not be raised, or null when it may. */
export function pinnedToL0(actionKey: string): string | null {
  const policy = getActionPolicy(actionKey);
  if (!policy) return "no one has classified this action, and an unclassified action is not safe by default";
  if (PINNED_ACTION_TYPES.includes(policy.actionType)) {
    return policy.actionType === "spend"
      ? "it spends money, and money is always a human decision"
      : "it deletes something, and an undo cannot restore what is gone";
  }
  if (PINNED_RISK_LEVELS.includes(policy.riskLevel)) {
    return "its consequence cannot be taken back once it happens";
  }
  return null;
}

/** Can this action hold L1 at all, given whether its platform can undo? */
export function canHoldL1(actionKey: string, hasUndo: boolean): { ok: boolean; why: string | null } {
  const pinned = pinnedToL0(actionKey);
  if (pinned) return { ok: false, why: pinned };
  if (!hasUndo) return { ok: false, why: "nothing can put this back yet, and L1 only means anything because a change is reversible" };
  return { ok: true, why: null };
}

/**
 * The level that actually applies, after every downward rule.
 *
 * Never reads the database. The caller passes what the row said; this
 * decides whether it is allowed to mean anything.
 */
export function effectiveLevel(actionKey: string, inputs: LevelInputs): AutonomyLevel {
  // Rule 6 first, before anything else can slow it down.
  if (inputs.direction === "disable") return "L1";
  if (inputs.stored !== "L1") return DEFAULT_LEVEL;
  return canHoldL1(actionKey, inputs.hasUndo).ok ? "L1" : DEFAULT_LEVEL;
}

/** Does this instance need a pending_approvals row before it runs? */
export function requiresApproval(actionKey: string, inputs: LevelInputs): boolean {
  return effectiveLevel(actionKey, inputs) === "L0";
}

/**
 * What the owner is told when a level could not be honoured.
 *
 * A SILENT DOWNGRADE IS THE WRONG KIND OF SAFE. If the owner has set an
 * action to L1 and it still asks every time, they should be told why
 * rather than concluding the setting does not work.
 */
export function levelNote(actionKey: string, inputs: LevelInputs): string | null {
  if (inputs.stored !== "L1") return null;
  const { ok, why } = canHoldL1(actionKey, inputs.hasUndo);
  return ok ? null : `You set this to run on your word, but I am still asking first: ${why}.`;
}
