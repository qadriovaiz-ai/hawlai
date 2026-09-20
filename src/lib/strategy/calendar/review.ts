// How the quarter actually went (Advanced Strategy step 5, approved
// 2026-09-20) — the half that closes the loop.
//
// Three honest measures, none of them guessed:
//   made        a week counts as done only when something was CREATED from
//               it ("Create this" carries the week: content_pieces
//               .strategy_week, migration 195). Matching by date instead
//               would call any post that week's work, which it isn't.
//   broughtBack what the quarter's own retargeting ads brought back, from
//               the business's own orders and bookings (R5).
//   funnel      where the funnel is now against the numbers saved when the
//               quarter was planned (strategy_quarters.baseline). Steps the
//               baseline didn't record are left out rather than shown as
//               growth from zero.
//
// Every read is filtered by the business and by that quarter's id.

import type { Diagnosis } from "@/lib/strategy/diagnosis";
import { resultsByAudience, type AudienceResults } from "@/lib/retargeting/results";

export type WeekMade = { week: number; made: number };

export type FunnelMove = {
  name: string;
  steps: { label: string; then: number; now: number; change: number }[];
};

export type QuarterReview = {
  weeksTotal: number;
  weeksWithSomethingMade: number;
  made: WeekMade[];
  broughtBack: { orders: number; revenueInr: number; bookings: number } | null;
  funnel: FunnelMove[];
  /** Said plainly when there's nothing to compare against. */
  notes: string[];
};

export async function reviewQuarter(
  service: any,
  dealershipId: string,
  quarter: { id: string; starts_on: string; weeks: { week: number }[]; baseline: any },
  diagnosisNow: Diagnosis | null
): Promise<QuarterReview> {
  const notes: string[] = [];
  const weeks = Array.isArray(quarter.weeks) ? quarter.weeks : [];

  const { data: pieces } = await service
    .from("content_pieces")
    .select("strategy_week")
    .eq("dealership_id", dealershipId)
    .eq("strategy_quarter_id", quarter.id);

  const counts = new Map<number, number>();
  for (const p of pieces ?? []) {
    const week = Number(p.strategy_week);
    if (!Number.isInteger(week)) continue;
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const made: WeekMade[] = weeks.map((w) => ({ week: w.week, made: counts.get(w.week) ?? 0 }));

  // What this quarter's own retargeting ads brought back.
  let broughtBack: QuarterReview["broughtBack"] = null;
  try {
    const results = await resultsByAudience(service, dealershipId, `${quarter.starts_on}T00:00:00+05:30`);
    const all = Object.values(results) as AudienceResults[];
    if (all.length > 0) {
      broughtBack = {
        orders: all.reduce((n, r) => n + r.orders, 0),
        revenueInr: all.reduce((n, r) => n + r.revenueInr, 0),
        bookings: all.reduce((n, r) => n + r.bookings, 0),
      };
    }
  } catch {
    notes.push("Couldn't read what your retargeting ads brought back just now.");
  }

  const funnel = compareFunnels(quarter.baseline, diagnosisNow);
  if (!quarter.baseline) notes.push("This quarter was planned before your numbers could be read, so there's nothing to compare against — the next one will have them.");
  else if (!diagnosisNow) notes.push("Couldn't read your last 90 days just now, so the funnel isn't compared.");

  return {
    weeksTotal: weeks.length,
    weeksWithSomethingMade: made.filter((m) => m.made > 0).length,
    made,
    broughtBack,
    funnel,
    notes,
  };
}

/** Where each step stands now against where it stood when the quarter was planned. */
export function compareFunnels(baseline: any, now: Diagnosis | null): FunnelMove[] {
  const before = Array.isArray(baseline?.funnels) ? baseline.funnels : [];
  if (!before.length || !now) return [];
  const out: FunnelMove[] = [];
  for (const f of before) {
    const current = now.funnels.find((x) => x.name === f.name);
    if (!current) continue;
    const steps: FunnelMove["steps"] = [];
    for (const s of Array.isArray(f.steps) ? f.steps : []) {
      const nowStep = current.steps.find((x) => x.key === s.key);
      // A step the baseline never recorded isn't growth from zero.
      if (!nowStep || typeof s.count !== "number") continue;
      steps.push({ label: s.label ?? nowStep.label, then: s.count, now: nowStep.count, change: nowStep.count - s.count });
    }
    if (steps.length) out.push({ name: f.name, steps });
  }
  return out;
}
