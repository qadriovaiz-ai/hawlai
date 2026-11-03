// WHAT A DECISION AND AN OUTCOME MAY SAY — S5/P0.
//
// The vocabularies and the rules, in code, beside migration 215's
// CHECKs. Same arrangement autonomyLevels.ts has with migration 209,
// and for the same reason its header gives: the database refuses a bad
// row at the worst possible moment, and a test refuses it now.
//
// THE RULE THE WHOLE STAGE IS BUILT ON:
//
//   An outcome records a MEASURED CHANGE and whether anything connects
//   that change to the action. It never records causation.
//
//   And "we could not tell" is a DIFFERENT outcome from "it had no
//   effect". `not_measurable` is a first-class verdict with a required
//   reason, not an absent row. Conflating those two is how a product
//   learns the wrong lesson and then acts on it confidently.
//
// Pure: no I/O, no model, so every rule below is checked without a
// database and without a month passing.

/**
 * The three words `business_signals` has used since migration 198.
 *
 * REUSED RATHER THAN INVENTED. A fourth vocabulary for one idea is how
 * two parts of a product come to disagree about what they know.
 */
export const CONFIDENCE = ["counted", "observed", "inferred"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

/** Whether anything connects the change to the action (migration 196). */
export const ATTRIBUTION = ["direct", "partial", "none"] as const;
export type Attribution = (typeof ATTRIBUTION)[number];

/**
 * And the fourth is the point of the whole stage.
 *
 * `not_measurable` is not an error state and not an absence — it is the
 * honest answer whenever the numbers could not be read, and it carries
 * its reason.
 */
export const VERDICT = ["improved", "unchanged", "worsened", "not_measurable"] as const;
export type Verdict = (typeof VERDICT)[number];

/**
 * The kinds of decision the results job knows how to measure.
 *
 * A CLOSED SET, unlike `action_levels.action_key`. That one is
 * deliberately unconstrained because the policy table is code and
 * moves faster than migrations; this one is constrained because the
 * results job must know HOW to measure each kind, so a kind it has
 * never heard of is a decision nobody can ever score.
 */
export const DECISION_KINDS = [
  "approval_granted",
  "goal_confirmed",
  "suggestion_acted_on",
  "automation_switched",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export type OutcomeRow = {
  verdict: Verdict;
  confidence: Confidence;
  attribution: Attribution;
  measuredBefore: number | null;
  measuredAfter: number | null;
  whyNotMeasurable: string | null;
};

/**
 * May this outcome be written?
 *
 * EVERY RULE HERE IS ALSO A CHECK IN MIGRATION 215, deliberately. The
 * database is the thing that cannot be bypassed; this is the thing that
 * fails in a test rather than at 9am on somebody's Tuesday. A rule in
 * only one of the two places is a rule that will drift.
 *
 * Returns the reason it may not, or null when it may.
 */
export function whyOutcomeIsNotWritable(row: OutcomeRow): string | null {
  const hasNumbers = row.measuredBefore !== null && row.measuredAfter !== null;

  // A VERDICT ABOUT A CHANGE NEEDS THE CHANGE, so "improved" can never
  // mean "felt better".
  if (row.verdict !== "not_measurable" && !hasNumbers) {
    return `a verdict of "${row.verdict}" needs both a before and an after`;
  }

  // AN UNEXPLAINED "COULD NOT TELL" IS THE SILENCE THIS STAGE EXISTS TO
  // STOP. Three guards in the two days before this was written failed
  // by saying nothing.
  if (row.verdict === "not_measurable" && !String(row.whyNotMeasurable ?? "").trim()) {
    return "a verdict of \"not_measurable\" has to say why";
  }

  // "COUNTED" MUST MEAN COUNTED. The weaker two words exist for the
  // cases this one does not cover.
  if (row.confidence === "counted" && !hasNumbers) {
    return "\"counted\" confidence needs both a before and an after";
  }

  return null;
}

/**
 * The verdict for a measured change — and ONLY for a measured change.
 *
 * NO ATTRIBUTION ARGUMENT, ON PURPOSE. Whether anything connects the
 * change to the action is a separate column, because a change can be
 * real AND unattributable, and the honest row says both. Folding
 * attribution into the verdict would turn "it went up, and nothing ties
 * that to this" into either a false claim or a thrown-away measurement.
 */
export function verdictFor(before: number, after: number): Verdict {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "not_measurable";
  if (after > before) return "improved";
  if (after < before) return "worsened";
  return "unchanged";
}

/**
 * Is this decision due to be measured?
 *
 * ON THE DAY COUNTS AS DUE. A check date is the day to look, not the
 * day after.
 */
export function isDue(checkDate: string, today: string): boolean {
  const due = String(checkDate ?? "").slice(0, 10);
  const now = String(today ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(now)) return false;
  return due <= now;
}

/**
 * The founder's P6 check date: short, so the loop can be watched
 * closing this week rather than in December.
 *
 * THE EXIT TEST'S OWN WAIT IS 28 DAYS AND CANNOT BE SHORTENED — this
 * does not pretend otherwise. It is a second, visible check for ONE
 * business, and the 28-day version stays labelled unverified until it
 * elapses.
 */
export const SHORT_CHECK_DAYS = 3;

/** The standard wait, which is what the exit test is about. */
export const STANDARD_CHECK_DAYS = 28;

/** A check date, N days from a given day, in the daily job's own terms. */
export function checkDateFrom(day: string, days: number): string {
  const at = Date.parse(`${String(day).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return String(day).slice(0, 10);
  return new Date(at + Math.max(0, Math.floor(days)) * 86_400_000).toISOString().slice(0, 10);
}
