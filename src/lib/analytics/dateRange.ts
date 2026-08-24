// ------------------------------------------------------------------
// Analytics date ranges.
// ------------------------------------------------------------------
// VERIFIED before building, and it corrected the premise: the
// analytics page had NO date filtering at all — every query was
// select("*") unbounded. What actually existed was FIVE different
// implicit windows that silently disagreed:
//   KPIs / score distribution / source / campaigns / attribution / LTV
//     -> all time
//   monthly trend, cohorts -> last 6 months (computed in JS)
//
// So a dealer was comparing a 6-month trend against all-time KPIs
// while reading them as the same period. Making every date-governed
// section agree is the real fix here; the picker is how it's exposed.
//
// NOT everything follows the picker, by confirmed decision — see
// RANGE_EXEMPT below. Three metrics would become quietly wrong if
// filtered, which is worse than being inconsistent.
// ------------------------------------------------------------------

export type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export interface ResolvedRange {
  key: RangeKey;
  /** Inclusive start, ISO. */
  from: string;
  /** Exclusive end, ISO — avoids the classic off-by-one where "today" drops today's own rows. */
  to: string;
  label: string;
  /** Days spanned, used for the previous-period comparison. */
  days: number;
}

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom" },
];

/**
 * Metrics that deliberately IGNORE the date picker, and why. Surfaced
 * in the UI as an explicit label rather than left for a dealer to
 * discover by noticing a number didn't move.
 */
export const RANGE_EXEMPT = {
  ltv: "Lifetime — not affected by the date range",
  cohorts: "Tracked from each acquisition month — not affected by the date range",
  attribution: "Uses each lead's full journey — not affected by the date range",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Resolves URL params into a concrete range.
 *
 * Defaults to 30d — both a sensible default and the value that makes
 * the previously-inconsistent sections agree. Invalid input falls back
 * to the default rather than erroring: a malformed URL should show a
 * normal dashboard, not a broken page.
 */
export function resolveRange(rangeParam?: string | null, fromParam?: string | null, toParam?: string | null): ResolvedRange {
  const now = new Date();
  // Exclusive end at tomorrow-midnight so rows created later today are
  // still included — a naive `to = now` silently drops the most recent
  // activity, which is exactly what someone checking "Today" is
  // looking for.
  const tomorrow = new Date(startOfDay(now).getTime() + DAY_MS);

  if (rangeParam === "custom" && fromParam && toParam) {
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
      const fromStart = startOfDay(from);
      const toEnd = new Date(startOfDay(to).getTime() + DAY_MS); // inclusive of the chosen end day
      return {
        key: "custom",
        from: fromStart.toISOString(),
        to: toEnd.toISOString(),
        label: `${fromParam} to ${toParam}`,
        days: Math.max(1, Math.round((toEnd.getTime() - fromStart.getTime()) / DAY_MS)),
      };
    }
    // Invalid custom input falls through to the default below.
  }

  const presets: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
  const key = (rangeParam && presets[rangeParam] ? rangeParam : "30d") as RangeKey;
  const days = presets[key] ?? 30;

  return {
    key,
    from: new Date(tomorrow.getTime() - days * DAY_MS).toISOString(),
    to: tomorrow.toISOString(),
    label: RANGE_OPTIONS.find((o) => o.key === key)?.label ?? "Last 30 days",
    days,
  };
}

/**
 * The equivalent window immediately before this one, for "vs previous
 * period" comparison. Same length, so the two are genuinely
 * comparable — comparing 7 days against a 30-day span would produce a
 * meaningless percentage.
 */
export function previousPeriod(range: ResolvedRange): { from: string; to: string } {
  const from = new Date(range.from).getTime();
  const span = range.days * DAY_MS;
  return {
    from: new Date(from - span).toISOString(),
    to: range.from,
  };
}

/** Buckets for the trend chart — daily for short ranges, monthly for long ones, so a 90-day view isn't 90 unreadable ticks. */
export function trendGranularity(range: ResolvedRange): "day" | "week" | "month" {
  if (range.days <= 14) return "day";
  if (range.days <= 90) return "week";
  return "month";
}
