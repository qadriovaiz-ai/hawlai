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
 *
 * `direction` IS a parameter, because "fewer" is better for some
 * measures and worse for others — see the note inside.
 */
export function verdictFor(before: number, after: number, direction: "up" | "down"): Verdict {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "not_measurable";
  if (after === before) return "unchanged";
  // DIRECTION IS NOT OPTIONAL, and leaving it out was a real trap. The
  // first version compared the two numbers alone, so a goal that closed
  // five findings down to two — the thing working exactly as intended —
  // would have been recorded as "worsened", and every month's review
  // would have read as failure.
  const rose = after > before;
  return direction === "up" ? (rose ? "improved" : "worsened") : rose ? "worsened" : "improved";
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

/**
 * How many days until the check date, for THIS business, TODAY.
 *
 * THE FOUNDER APPROVED A SHORT CHECK FOR ONE BUSINESS so the loop could
 * be watched closing this week rather than in December (S5, decision 1
 * of 4). This is how it is armed, and the shape is copied deliberately
 * from `GROWTH_COPY_AUDIT_ON` in dailyGrowth.ts, which learned both of
 * its lessons the hard way:
 *
 *   GROWTH_SHORT_CHECK_UNTIL=2026-11-30:ba79191a-...   one business, until that day
 *   GROWTH_SHORT_CHECK_UNTIL=2026-11-30                arms NOTHING
 *
 * 1. IT NAMES THE BUSINESS, because dailyJobs.ts runs every subsystem
 *    once per dealership. A bare date would put every business in the
 *    product on a three-day check — their outcomes measured three days
 *    after a decision, when the thing being measured has barely had
 *    time to move — against an approval for one. A bare date therefore
 *    arms nothing and says so in the log.
 *
 * 2. IT EXPIRES BY ITSELF. "Remember to turn it off" is not a
 *    safeguard, and a short check left on is worse than an unbudgeted
 *    spend: it is a permanent stream of outcomes measured too early,
 *    which this product would then report as results.
 *
 * NO BUSINESS NAME ANYWHERE HERE. The id comes from the environment, so
 * nothing about one business is written into the code (CLAUDE.md rule
 * 3) — the same reason the copy audit is armed this way.
 *
 * AND IT DOES NOT SHORTEN THE EXIT TEST. The exit criterion is 28 days
 * and cannot be hurried; this is a second, visible check for one
 * business, and the 28-day version stays labelled unverified until it
 * elapses.
 */
export function checkDaysFor(
  dealershipId: string,
  day: string,
  armed: string | undefined = process.env.GROWTH_SHORT_CHECK_UNTIL
): number {
  const raw = String(armed ?? "").trim();
  if (!raw) return STANDARD_CHECK_DAYS;

  const [untilRaw, businessRaw] = raw.includes(":") ? raw.split(":", 2) : [raw, ""];
  const until = untilRaw.trim();
  const business = businessRaw.trim();

  if (!business) {
    console.error(
      `[decisions] GROWTH_SHORT_CHECK_UNTIL is set to a bare date, which would put EVERY business on a ${SHORT_CHECK_DAYS}-day check. It was ignored. Use "${until}:<dealership_id>".`
    );
    return STANDARD_CHECK_DAYS;
  }
  if (business !== dealershipId) return STANDARD_CHECK_DAYS;

  // PAST ITS DATE IS OFF. Compared as the daily job's own day strings,
  // which are what both sides of this already are.
  const today = String(day).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || today > until) return STANDARD_CHECK_DAYS;

  return SHORT_CHECK_DAYS;
}

/** A check date, N days from a given day, in the daily job's own terms. */
export function checkDateFrom(day: string, days: number): string {
  const at = Date.parse(`${String(day).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return String(day).slice(0, 10);
  return new Date(at + Math.max(0, Math.floor(days)) * 86_400_000).toISOString().slice(0, 10);
}
