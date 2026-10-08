// The Health Score, counted rather than guessed.
//
// WHAT IT WAS. growthAdvisorAgent asked the model for
// `healthScore: integer 0-100 (honest — a business with 0 leads or 0
// live campaigns should score low)` and printed `parsed.healthScore`.
// So the number was a judgement by a language model about a paragraph of
// numbers, and on candle_by_qaaf it moved from 60/100 on 28 September to
// 18/100 on 1 October with nothing underneath it changing. Neither
// figure was wrong, because neither meant anything.
//
// WHAT IT IS NOW. Points for things that are counted, each one named,
// with the inputs shown — the way the Strategy page already works. An
// owner who disagrees with the score can see which line they disagree
// with, and a score that does not move is as informative as one that
// does.
//
// AND IT REFUSES TO SCORE WHAT IT CANNOT MEASURE. A business with five
// leads has not earned a 60 or a 18; it has not earned a number. Below
// the floor the score is null and the surface says what is missing,
// because a figure out of 100 invites a decision and there is nothing
// here to decide from.

import type { BusinessNumbers } from "./businessNumbers";

/** One counted line of the score, with the number it came from. */
export type ScoreLine = {
  label: string;
  /** What this line is worth at most. */
  max: number;
  earned: number;
  /** The counted input, in the owner's terms. */
  basis: string;
};

export type HealthScore =
  | {
      scored: true;
      /** 0-100, the sum of the lines below and nothing else. */
      score: number;
      lines: ScoreLine[];
      /** Inputs that could not be read, so the score is out of less than 100. */
      unreadable: string[];
    }
  | {
      scored: false;
      /** Why there is no score, in words that say what would produce one. */
      reason: string;
      lines: ScoreLine[];
    };

/**
 * The least a business needs before a score out of 100 means anything.
 *
 * Five leads and one order is not a funnel; it is an anecdote. Scoring
 * it produces a number that moves twenty points on one more lead, which
 * reads as a trend and is noise.
 */
export const SCORE_FLOOR = { leads: 10, orders: 3 };

export function computeHealthScore(n: BusinessNumbers): HealthScore {
  const lines: ScoreLine[] = [];
  const unreadable: string[] = [];

  // 1. Is anyone arriving? (25)
  const leadPoints = n.totalLeads >= 50 ? 25 : n.totalLeads >= 20 ? 18 : n.totalLeads >= 10 ? 12 : n.totalLeads >= 1 ? 5 : 0;
  lines.push({
    label: "People getting in touch",
    max: 25,
    earned: leadPoints,
    basis: `${n.totalLeads} lead${n.totalLeads === 1 ? "" : "s"} on record`,
  });

  // 2. Do they buy? (25) — only when there is something to divide by.
  const convertible = n.totalLeads > 0;
  const rate = convertible ? n.convertedLeads / n.totalLeads : null;
  const convPoints = rate === null ? 0 : rate >= 0.2 ? 25 : rate >= 0.1 ? 18 : rate >= 0.05 ? 10 : rate > 0 ? 5 : 0;
  lines.push({
    label: "Enquiries that became customers",
    max: 25,
    earned: convPoints,
    basis: convertible
      ? `${n.convertedLeads} of ${n.totalLeads} (${Math.round((rate ?? 0) * 100)}%)`
      : "no leads yet, so there is nothing to convert",
  });

  // 3. Is money coming in? (25)
  const revenuePoints = n.totalRevenue >= 50000 ? 25 : n.totalRevenue >= 10000 ? 18 : n.totalRevenue >= 1000 ? 12 : n.totalRevenue > 0 ? 6 : 0;
  lines.push({
    label: "Revenue on record",
    max: 25,
    earned: revenuePoints,
    basis: `₹${n.totalRevenue.toLocaleString("en-IN")} from ${n.paidOrders} paid order${n.paidOrders === 1 ? "" : "s"}${n.leadRevenue > 0 ? ` and ₹${n.leadRevenue.toLocaleString("en-IN")} from converted leads` : ""}`,
  });

  // 4. Is anything running? (25) — and an unreadable ad account is
  // UNREADABLE, not zero. Scoring a disconnected Meta account as "no
  // marketing" would blame the owner for our own failure to read it.
  if (!n.adDataReadable) {
    unreadable.push(
      n.adDataState === "not_connected"
        ? "Meta isn't connected, so there is no way to tell what advertising is running"
        : "Meta couldn't be read just now, so advertising is left out of the score"
    );
  } else {
    const runningPoints = n.liveCampaigns >= 2 ? 15 : n.liveCampaigns === 1 ? 10 : 0;
    const spendPoints = (n.totalSpend ?? 0) > 0 ? 10 : 0;
    lines.push({
      label: "Marketing actually running",
      max: 25,
      earned: runningPoints + spendPoints,
      // A campaign that is Active and has spent nothing is not running,
      // whatever its status says — the live case was Active for 19 days
      // at ₹0 and 0 impressions.
      basis: `${n.liveCampaigns} live campaign${n.liveCampaigns === 1 ? "" : "s"}, ₹${(n.totalSpend ?? 0).toLocaleString("en-IN")} spent${n.liveCampaigns > 0 && (n.totalSpend ?? 0) === 0 ? " — live but spending nothing, so it isn't reaching anyone" : ""}`,
    });
  }

  const possible = lines.reduce((sum, l) => sum + l.max, 0);
  const earned = lines.reduce((sum, l) => sum + l.earned, 0);

  // THE FLOOR. Below it there is no score, only the lines.
  if (n.totalLeads < SCORE_FLOOR.leads && n.paidOrders < SCORE_FLOOR.orders) {
    return {
      scored: false,
      reason: `Too little has happened to score this out of 100 — ${n.totalLeads} lead${n.totalLeads === 1 ? "" : "s"} and ${n.paidOrders} paid order${n.paidOrders === 1 ? "" : "s"}. A score built on this would swing twenty points on one more enquiry, which reads like a trend and isn't one. It starts once there are ${SCORE_FLOOR.leads} leads or ${SCORE_FLOOR.orders} paid orders.`,
      lines,
    };
  }

  return {
    scored: true,
    // Out of what was measurable, scaled to 100, so an unreadable ad
    // account lowers confidence rather than the score.
    score: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    lines,
    unreadable,
  };
}

/** One sentence for a surface that has room for one. */
export function healthScoreSummary(result: HealthScore): string {
  if (!result.scored) return result.reason;
  const shown = result.lines.map((l) => `${l.label} ${l.earned}/${l.max} (${l.basis})`).join("; ");
  return `${result.score}/100 — ${shown}.${result.unreadable.length ? ` ${result.unreadable.join(" ")}` : ""}`;
}
