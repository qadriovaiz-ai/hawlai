// THE NUMBERS AND LISTS S7 TURNS ON — one file, on purpose.
//
// The founder's six decisions of 5 November 2026 are policy, not
// mechanism. A threshold buried in a query is a threshold nobody can
// find and nobody can argue with; here, changing the rule is one
// visible edit with a test on it.
//
// WHAT IS HERE IS WHAT IS READ. S7/P4 defines the allowlist because
// `canHoldL2` reads it today. The promotion thresholds and the daily cap
// arrive with P5 and P6 — the code that reads them. A constant with
// nothing reading it is a setting that looks live and is not, which is
// the shape of the auto-reply fault still open in production.

/**
 * The only action keys that may ever run unattended.
 *
 * THE FOUNDER'S DECISION 3: `update_page_meta` alone — the search title
 * and description of a page of the business's own site. Reversible,
 * undo-backed (hawlaiSite is the only platform implementing `undo()`),
 * nothing spends, nothing reaches a customer's inbox, and it is the
 * action he has approved most often.
 *
 * ENFORCED TWICE, AND THAT IS THE POINT. This list is the code's half;
 * migration 220's `action_levels_l2_allowlist` is the database's. A
 * code-only guard is one edit away from gone — migration 209's own
 * words. tests/autonomyLevels.test.ts pins the two together so a key
 * added here and not there cannot reach production, where it would fail
 * every insert instead of being refused honestly.
 *
 * IT IS A LIST OF WHAT IS EARNED, not of what is possible. Adding to it
 * is a decision, and it is meant to be a slow one.
 */
export const L2_ALLOWLIST: readonly string[] = ["update_page_meta"];

/**
 * How much evidence earns an action the right to run alone.
 *
 * THE FOUNDER'S DECISION 4, 5 November 2026, in his numbers: ten
 * approvals as requested, no rejections, no modifications, over at
 * least thirty days, with at least one measured outcome that is neither
 * `worsened` nor `not_measurable`.
 *
 * ONE FILE, so changing the rule is one visible edit. A threshold
 * buried in a query is a threshold nobody can find and nobody can
 * argue with.
 *
 * EVERY NUMBER IS A COUNT OF HIS OWN ROWS. pending_approvals has
 * carried status, reviewed_at and modified_details all along, and S5's
 * outcomes carry whether the work helped — so nothing new is collected
 * for promotion. S7's new collection (claim_checks) is for the
 * DEMOTION side, which is the half that had no instrument.
 */
export const PROMOTION_EVIDENCE = {
  /** Approved exactly as asked. A modification is not one of these. */
  approvalsAsRequested: 10,
  /** How many rejections are tolerated. None. */
  rejections: 0,
  /** How many approve-with-changes are tolerated. None — see promotion.ts. */
  modifications: 0,
  /** And over at least this long, so volume cannot buy time. */
  days: 30,
  /** With at least this many outcomes that were actually measurable. */
  measuredOutcomes: 1,
} as const;

/**
 * The most unattended actions one business gets in one day.
 *
 * THE FOUNDER'S DECISION 6, 5 November 2026: three, for the first
 * action and the first month. His words, and his reasoning is the right
 * one — a cap that turns out to be too low is a line in this file, and
 * a cap that turns out to be too high is a morning he reads about
 * afterwards.
 *
 * ENFORCED AT THE DOOR, in `publish/create.ts`, where the level is read
 * — and when it is reached the action does not fail, it ASKS. The safe
 * direction is the one that already exists.
 */
export const L2_DAILY_CAP = 3;

/** Is this action one the owner's product is allowed to run on its own? */
export function isAllowlistedForL2(actionKey: string): boolean {
  return L2_ALLOWLIST.includes(String(actionKey ?? ""));
}
