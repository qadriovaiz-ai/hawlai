// ------------------------------------------------------------------
// Predictive cost monitoring — Usage/Pricing/Cost-Control, Phase 4 / 3.
// ------------------------------------------------------------------
// "At this rate, this month reaches ₹X." A linear run-rate projection
// over real logged spend — no new data, no schema.
//
// THE HONESTY PROBLEM this is built around: three days of data
// extrapolated to thirty is noise wearing a precise-looking number.
// Worse, spend here is genuinely lumpy — one video generation is
// ~₹28 while a Haiku call is fractions of a rupee, so a single busy
// day early in the month can double an naive projection.
//
// So the rules are:
//   - Under MIN_DAYS_FOR_PROJECTION days elapsed: NO number at all.
//     Not a number with a caveat — no number. There is nothing
//     honest to say yet.
//   - Below LOW_CONFIDENCE_DAYS: show it, explicitly labelled a rough
//     early estimate.
//   - High day-to-day variance: downgrade confidence regardless of
//     how many days have elapsed, because a stable-looking average
//     over volatile days is exactly the misleading case.
// A range is always returned alongside the point estimate so a
// consumer can show the spread rather than implying false precision.
// ------------------------------------------------------------------

const MIN_DAYS_FOR_PROJECTION = 3;
const LOW_CONFIDENCE_DAYS = 7;
// Coefficient of variation (stddev / mean) above which daily spend is
// too erratic to project confidently, however many days we have.
const HIGH_VARIANCE_CV = 0.8;

export type ProjectionConfidence = "insufficient_data" | "low" | "moderate" | "good";

export interface SpendProjection {
  confidence: ProjectionConfidence;
  daysElapsed: number;
  daysInMonth: number;
  spendSoFarInr: number;
  dailyAverageInr: number;
  /** null whenever confidence is "insufficient_data" — deliberately not a number to display. */
  projectedMonthEndInr: number | null;
  /** Plausible spread around the projection, null under the same condition. */
  projectedRangeInr: { low: number; high: number } | null;
  /** Plain-language explanation of what this number is and isn't. Always safe to show verbatim. */
  caveat: string;
}

interface UsageLogRow {
  created_at: string;
  cost_inr: number | string | null;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Projects month-end spend from this month's logs so far.
 * `logs` must already be filtered to the current month.
 */
export function projectMonthEndSpend(logs: UsageLogRow[], now: Date = new Date()): SpendProjection {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // The current day counts as elapsed only once it's over, so a
  // partial today never drags the daily average down.
  const daysElapsed = Math.max(0, now.getUTCDate() - 1);

  // Bucket by day so variance is measurable — a single total can't
  // tell a steady month from one spike.
  const byDay = new Map<string, number>();
  let spendSoFarInr = 0;
  for (const log of logs) {
    const cost = Number(log.cost_inr) || 0;
    spendSoFarInr += cost;
    const day = String(log.created_at).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + cost);
  }
  spendSoFarInr = Math.round(spendSoFarInr * 100) / 100;

  if (daysElapsed < MIN_DAYS_FOR_PROJECTION) {
    return {
      confidence: "insufficient_data",
      daysElapsed,
      daysInMonth,
      spendSoFarInr,
      dailyAverageInr: 0,
      projectedMonthEndInr: null,
      projectedRangeInr: null,
      caveat: `Only ${daysElapsed} complete ${daysElapsed === 1 ? "day" : "days"} into the month — too early to project month-end spend meaningfully.`,
    };
  }

  // Days with zero logged spend are real zeros, not missing data —
  // include them so the average isn't inflated by only counting
  // active days.
  const dailyTotals: number[] = [];
  for (let d = 1; d <= daysElapsed; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    dailyTotals.push(byDay.get(key) ?? 0);
  }

  const dailyAverageInr = spendSoFarInr / daysElapsed;
  const sd = stdDev(dailyTotals, dailyAverageInr);
  const cv = dailyAverageInr > 0 ? sd / dailyAverageInr : 0;

  const remainingDays = daysInMonth - daysElapsed;
  const projected = spendSoFarInr + dailyAverageInr * remainingDays;

  // Range from the observed daily variance across the remaining days,
  // not an invented percentage — if spend has been steady the range
  // is tight, and if it's been erratic the range says so.
  const spread = sd * remainingDays;
  const low = Math.max(spendSoFarInr, projected - spread);
  const high = projected + spread;

  let confidence: ProjectionConfidence;
  if (cv > HIGH_VARIANCE_CV) confidence = "low";
  else if (daysElapsed < LOW_CONFIDENCE_DAYS) confidence = "low";
  else if (daysElapsed < 14) confidence = "moderate";
  else confidence = "good";

  const caveats: Record<Exclude<ProjectionConfidence, "insufficient_data">, string> = {
    low: cv > HIGH_VARIANCE_CV
      ? `Daily spend has been uneven this month, so this is a rough estimate — the real total could land well outside it.`
      : `Based on only ${daysElapsed} days, so treat this as a rough early estimate.`,
    moderate: `Based on ${daysElapsed} days of this month. Reasonably indicative, but a change in activity would shift it.`,
    good: `Based on ${daysElapsed} days of this month — a fairly reliable projection unless activity changes.`,
  };

  return {
    confidence,
    daysElapsed,
    daysInMonth,
    spendSoFarInr,
    dailyAverageInr: Math.round(dailyAverageInr * 100) / 100,
    projectedMonthEndInr: Math.round(projected),
    projectedRangeInr: { low: Math.round(low), high: Math.round(high) },
    caveat: caveats[confidence],
  };
}

/**
 * Compares a projection against the implied monthly budget derived
 * from the configured DAILY spend alert threshold. Derived rather
 * than separately configured — a second monthly threshold to keep in
 * sync would drift out of agreement with the daily one.
 * Returns null when there's nothing trustworthy enough to warn about.
 */
export function projectedBudgetWarning(
  projection: SpendProjection,
  dailyThresholdInr: number | null
): string | null {
  if (dailyThresholdInr == null || projection.projectedMonthEndInr == null) return null;
  // Never warn off a projection we've already said is rough — that's
  // how alerting becomes noise people learn to ignore.
  if (projection.confidence === "low") return null;

  const impliedMonthly = dailyThresholdInr * projection.daysInMonth;
  if (projection.projectedMonthEndInr <= impliedMonthly) return null;

  const over = projection.projectedMonthEndInr - impliedMonthly;
  return `At this rate the month ends around ₹${projection.projectedMonthEndInr.toLocaleString("en-IN")} — about ₹${Math.round(over).toLocaleString("en-IN")} above the ₹${impliedMonthly.toLocaleString("en-IN")} your daily alert threshold implies for a full month.`;
}
