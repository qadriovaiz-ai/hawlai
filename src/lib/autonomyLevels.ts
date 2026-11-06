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
//   L2  RUNS UNATTENDED. Nobody instructed it: the growth manager
//       finds something in the morning run and does it, and the owner
//       reads about it afterwards. Added by S7/P4 on 6 November 2026,
//       and migration 220 widened the CHECK that used to make it
//       unspellable.
//
// L2 WAITED FOR THE MEASUREMENT, WHICH IS THE WHOLE REASON IT CAN EXIST
// NOW. The founder's position of 22 October was that it waits for S5's
// outcome loop, because the rule is "kabhi nuksaan na ho, sirf growth"
// and that proof only comes from measurement. What arrived since: S5's
// decision and outcome records, S7/P1's record of what actually went
// out, S7/P2's second judge reading it, and S7/P3's brake, which lowers
// a level the moment an unsupported claim reaches the public or nobody
// has been able to check for two days.
//
// NOTHING IS AT L2 YET. The allowlist holds one key, no row has been
// written, and promotion (S7/P5) does not exist — so this file can
// express L2 and nothing in the product can grant it.
//
// AND THE DATABASE STILL REFUSES MOST OF IT. Migration 220 widened the
// level check and added a SECOND constraint naming the keys that may
// hold L2, so a code-only mistake cannot write one. Migration 209's own
// reasoning, which predicted this migration: "A code-only guard would
// be one edit away from gone; a row that cannot be written is not."
//
// THE DANGEROUS DIRECTION IS UP. Everything here is written so that
// every unclear case resolves DOWNWARD to L0: a missing row, an
// unknown action, an action whose platform cannot undo itself. The
// header of ACTION_POLICIES already says absence is not "safe by
// default", and this inherits that reading rather than restating it.

import { getActionPolicy, type ActionType, type RiskLevel } from "@/lib/executionPolicy";
import { isAllowlistedForL2 } from "@/lib/autonomy/policy";

export type AutonomyLevel = "L0" | "L1" | "L2";

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

/**
 * Actions pinned by WHAT THEY SWITCH ON, not by their own risk.
 *
 * FOUND BY S7's EXIT TEST ON 6 NOVEMBER 2026, and it was a real hole.
 * `set_automation_toggle` is classified `edit` / `high` — not spend,
 * not delete, not critical — so every rule above let it reach L1. But
 * ACTION_POLICIES' own comment says what it is: "THE ONE THAT TURNS OFF
 * EVERY OTHER GATE. After this runs, content publishes and emails send
 * with nobody looking."
 *
 * Four of the six AUTOMATION_TOGGLES are `critical`: replying to every
 * DM, replying publicly to comments, calling every new lead, and
 * posting on a schedule with no review. An action whose effect is to
 * start one of those cannot be less gated than the thing it starts.
 *
 * SWITCHING OFF IS UNAFFECTED. `effectiveLevel` returns on
 * `direction === "disable"` before any of this is consulted — rule 6,
 * and a test walks it for exactly this key.
 */
const PINNED_ACTION_KEYS = new Set<string>(["set_automation_toggle"]);

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
  if (PINNED_ACTION_KEYS.has(actionKey)) {
    return "it switches on an automation that then acts with nobody watching, so it cannot be less gated than that automation";
  }
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

/**
 * Can this action hold L1 at all, given whether its platform can undo?
 *
 * THE SECOND ARGUMENT IS AN OBJECT, AND THE REASON IS A NEAR MISS.
 * S7/P4 wrote `canHoldL2(key, hasUndo: boolean)` to match this
 * function's old shape, and the exit test — which had been written
 * first, with an object — called it as `canHoldL2(key, { hasUndo:
 * false })`. A positional boolean accepted that object, read it as
 * TRUTHY, and answered `ok: true` for an action with no undo. The
 * failure mode of a bare boolean here is a silent UN-GATING, which is
 * the one direction this file is written to make impossible.
 *
 * So both take `{ hasUndo }`. There is no caller it can be passed
 * wrongly from any more.
 */
export function canHoldL1(actionKey: string, inputs: { hasUndo: boolean }): { ok: boolean; why: string | null } {
  const pinned = pinnedToL0(actionKey);
  if (pinned) return { ok: false, why: pinned };
  if (!inputs.hasUndo) return { ok: false, why: "nothing can put this back yet, and L1 only means anything because a change is reversible" };
  return { ok: true, why: null };
}

/**
 * Can this action run with nobody watching?
 *
 * EVERYTHING L1 NEEDS, AND TWO THINGS MORE. L1 is justified by
 * reversibility; L2 is justified by reversibility AND by this
 * particular action having been earned. So:
 *
 *   1. every refusal that applies to L1 applies here — spend, delete,
 *      critical risk, an unclassified action, a platform with no undo
 *   2. and the action must be on the allowlist, which is a list of what
 *      has been EARNED rather than of what is possible
 *
 * THE ALLOWLIST IS CHECKED LAST, so the reason an action is refused is
 * the most specific true one: "it spends money" rather than "it is not
 * on the list", for an action that would never be on the list.
 *
 * NOTHING HERE CONSULTS A STORED ROW. This answers whether a level is
 * permissible at all; `effectiveLevel` answers what applies.
 */
export function canHoldL2(actionKey: string, inputs: { hasUndo: boolean }): { ok: boolean; why: string | null } {
  const asL1 = canHoldL1(actionKey, inputs);
  if (!asL1.ok) return asL1;
  if (!isAllowlistedForL2(actionKey)) {
    return {
      ok: false,
      why: "it has not been shown to be safe to do unattended yet, so I will keep asking",
    };
  }
  return { ok: true, why: null };
}

/**
 * The highest level this action could ever hold, whatever any row says.
 *
 * FOR THE EXIT TEST AND FOR THE OWNER'S SCREEN, and it is deliberately
 * not derived from `effectiveLevel`: that reads a stored value and
 * answers "what applies now". This answers "what is possible at all",
 * which is the question somebody asks before setting anything.
 */
export function maxLevelFor(actionKey: string, inputs: { hasUndo: boolean }): AutonomyLevel {
  if (canHoldL2(actionKey, inputs).ok) return "L2";
  if (canHoldL1(actionKey, inputs).ok) return "L1";
  return DEFAULT_LEVEL;
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
  // L2 FALLS TO L0, NOT TO L1, WHEN IT IS REFUSED. An action the owner
  // set to run unattended, refused that, has not thereby been given
  // permission to run on his word either — he never said that. Every
  // unclear case resolves to asking.
  if (inputs.stored === "L2") return canHoldL2(actionKey, inputs).ok ? "L2" : DEFAULT_LEVEL;
  if (inputs.stored !== "L1") return DEFAULT_LEVEL;
  return canHoldL1(actionKey, inputs).ok ? "L1" : DEFAULT_LEVEL;
}

/**
 * Does this instance need a pending_approvals row before it runs?
 *
 * UNCHANGED BY L2, AND THAT IS WORTH SAYING. L0 is the only level that
 * asks, so this stays "is it L0" rather than becoming a list of levels
 * that do not — a list is one forgotten entry away from un-gating
 * something.
 */
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
  if (inputs.stored === "L2") {
    const { ok, why } = canHoldL2(actionKey, inputs);
    return ok ? null : `You set this to run on its own, but I am still asking first: ${why}.`;
  }
  if (inputs.stored !== "L1") return null;
  const { ok, why } = canHoldL1(actionKey, inputs);
  return ok ? null : `You set this to run on your word, but I am still asking first: ${why}.`;
}
