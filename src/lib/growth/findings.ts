// WHAT MAKES A FINDING WORTH PUTTING IN FRONT OF THE OWNER — S4/P0.
//
// The Strategist's rules, as code, before the Strategist exists. Three
// of them come straight from the founder's scope:
//
//   score      impact x confidence / effort
//   cap        at most 3 actions a day
//   cooldown   30 days after a rejection
//
// and two from the exit test, which is the one that decides whether S4
// passed at all:
//
//   > "Daily email arrives with only counted numbers; each suggestion
//   >  cites evidence and the goal it serves"
//
// so a finding with no evidence, or with no goal, is not a suggestion.
// It is refused here rather than rendered bare, because the exit test
// is about what the owner RECEIVES and the only reliable way to pass it
// is to make the unfit thing unsendable.
//
// NO I/O IN THIS FILE, deliberately — the same split that made
// autonomyLevels.ts testable in S3/P0. Every rule below can be checked
// without a database, and the one place that reads the table is the
// caller.

/** The three inputs, each 1-5. Never a free-floating number. */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/** The founder's cap: three actions a day, whatever the scores say. */
export const MAX_ACTIONS_PER_DAY = 3;

/** How long a rejected finding stays out of the owner's way. */
export const REJECTION_COOLDOWN_DAYS = 30;

/**
 * A pointer to something the owner can go and look at.
 *
 * NOT PROSE. "because your traffic is down" is not evidence; a row id,
 * a page id, a metric key with a date range is. The renderer needs
 * something it can turn into a link or a number the owner can check,
 * and the exit test's word is "cites".
 */
export type Evidence = { kind: string; id: string };

export type FindingScore = { impact: number; confidence: number; effort: number };

export type Finding = {
  score: FindingScore | null;
  evidence: Evidence[];
  /** Which 90-day goal this serves. Required: see the exit test. */
  goalId: string | null;
  /** When the owner last said no, if ever. */
  rejectedAt?: string | null;
};

function whole(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= SCORE_MIN && n <= SCORE_MAX;
}

/** All three inputs present and in range, or the score means nothing. */
export function scorable(s: FindingScore | null | undefined): boolean {
  if (!s) return false;
  return whole(s.impact) && whole(s.confidence) && whole(s.effort);
}

/**
 * impact x confidence / effort.
 *
 * EFFORT CANNOT BE ZERO, and that is a schema guarantee rather than a
 * hope: migration 210's CHECK puts all three inputs between 1 and 5, so
 * there is no row this can divide by nothing. `scorable` is still
 * checked first, because a value arriving from anywhere other than that
 * table has no such guarantee.
 */
export function scoreOf(s: FindingScore): number {
  if (!scorable(s)) throw new Error("a finding cannot be scored from incomplete inputs");
  return Math.round(((s.impact * s.confidence) / s.effort) * 1000) / 1000;
}

/** Is this finding still inside its rejection cooldown? */
export function inCooldown(rejectedAt: string | null | undefined, now: Date): boolean {
  if (!rejectedAt) return false;
  const at = Date.parse(String(rejectedAt));
  // AN UNREADABLE DATE COUNTS AS INSIDE THE COOLDOWN. The owner said no
  // to this once; a timestamp this code cannot parse is not permission
  // to ask again.
  if (!Number.isFinite(at)) return true;
  const days = (now.getTime() - at) / 86_400_000;
  return days < REJECTION_COOLDOWN_DAYS;
}

export type Surfaceable = { ok: true } | { ok: false; why: string };

/**
 * May this finding go in today's report?
 *
 * Checked in this order on purpose: the finding's own fitness first,
 * the day's cap last. A finding refused for having no evidence should
 * say so, not "there was no room" — the daily log is the only place
 * anyone will see why a finding never reached the owner.
 */
export function surfaceable(finding: Finding, opts: { now: Date; surfacedToday: number }): Surfaceable {
  if (!scorable(finding.score)) return { ok: false, why: "it has no complete score, so it cannot be ranked against anything else" };
  if (!finding.evidence.length) return { ok: false, why: "it cites no evidence, and a suggestion the owner cannot check is not a suggestion" };
  if (finding.evidence.some((e) => !String(e?.kind ?? "").trim() || !String(e?.id ?? "").trim()))
    return { ok: false, why: "one of its evidence entries has no kind or no id, so it points at nothing" };
  if (!finding.goalId) return { ok: false, why: "it serves no goal on record, and the report has to say which one it serves" };
  if (inCooldown(finding.rejectedAt, opts.now))
    return { ok: false, why: `the owner rejected it less than ${REJECTION_COOLDOWN_DAYS} days ago` };
  if (opts.surfacedToday >= MAX_ACTIONS_PER_DAY)
    return { ok: false, why: `today already has ${MAX_ACTIONS_PER_DAY} actions, which is the cap` };
  return { ok: true };
}

/**
 * The day's picks, highest score first.
 *
 * TAKES THE CAP INTO ACCOUNT AS IT GOES rather than slicing at the end,
 * so a finding that is unfit never occupies one of the three places.
 * Sorted before the cap is applied, so the cap drops the lowest-scoring
 * fit findings rather than whichever the caller happened to pass first.
 */
export function pickForToday<T extends Finding>(
  findings: T[],
  opts: { now: Date; surfacedToday?: number }
): { picked: T[]; skipped: { finding: T; why: string }[] } {
  const ranked = [...findings].sort((a, b) => {
    const sa = scorable(a.score) ? scoreOf(a.score!) : -1;
    const sb = scorable(b.score) ? scoreOf(b.score!) : -1;
    return sb - sa;
  });
  const picked: T[] = [];
  const skipped: { finding: T; why: string }[] = [];
  let used = opts.surfacedToday ?? 0;
  for (const finding of ranked) {
    const verdict = surfaceable(finding, { now: opts.now, surfacedToday: used });
    if (verdict.ok) {
      picked.push(finding);
      used += 1;
    } else {
      skipped.push({ finding, why: verdict.why });
    }
  }
  return { picked, skipped };
}
