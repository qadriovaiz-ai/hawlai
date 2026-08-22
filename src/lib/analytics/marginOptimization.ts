// ------------------------------------------------------------------
// Margin optimization — Usage/Pricing/Cost-Control, Phase 4 / 4.
// ------------------------------------------------------------------
// Rule-based suggestions over the real revenue/cost numbers the admin
// dashboard already computes. DELIBERATELY NOT AI-generated: an LLM
// asked to "suggest margin optimizations" produces generic advice
// that reads as insightful and says nothing specific. Rules over
// already-precise data produce specific, explainable, zero-cost
// findings that cite the actual numbers behind them.
//
// Every suggestion carries the figures it was derived from, so an
// operator can check the reasoning rather than trusting a verdict.
//
// HONESTY RULE, same as the spend projection: with no paying
// customers, revenue is ~0 and margin is mathematically meaningless
// (or wildly negative). Rather than screaming "-4000% margin,
// urgent!", the no-revenue case is detected first and reported as
// what it actually is — a platform with real cost and no revenue yet,
// which is the expected state pre-launch, not a margin problem.
// ------------------------------------------------------------------

import type { PlanKey } from "@/lib/plans";

// Target gross margins from the spec's Section 18, mapped onto this
// app's actual plan names (the spec used Starter/Growth/Pro/Business/
// Enterprise; ours are Free/Basic/Growth/Pro/Agency). Free has no
// revenue by definition, so no target applies.
export const TARGET_MARGIN_PCT: Partial<Record<PlanKey, { min: number; max: number }>> = {
  basic: { min: 75, max: 85 },
  growth: { min: 70, max: 80 },
  pro: { min: 60, max: 75 },
  agency: { min: 60, max: 75 },
};

export type SuggestionSeverity = "info" | "warning" | "critical";

export interface MarginSuggestion {
  id: string;
  severity: SuggestionSeverity;
  title: string;
  detail: string;
}

export interface MarginInput {
  revenueInr: number;
  cogsInr: number;
  grossMarginPct: number | null;
  byPlan: Record<string, { dealerships: number; revenueInr: number; costInr: number }>;
  byOperation: Record<string, number>;
  perDealership: { id: string; name: string; plan: string; revenueInr: number; exactCostInr: number }[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number) => `${Math.round(n)}%`;

export function computeMarginSuggestions(input: MarginInput): MarginSuggestion[] {
  const suggestions: MarginSuggestion[] = [];

  // Pre-revenue is a distinct state, not a margin failure. Detected
  // first so nothing below reports a meaningless negative percentage.
  if (input.revenueInr <= 0) {
    suggestions.push({
      id: "no_revenue",
      severity: input.cogsInr > 0 ? "info" : "info",
      title: "No subscription revenue yet",
      detail: input.cogsInr > 0
        ? `${inr(input.cogsInr)} of real provider cost this month against no revenue. That's expected before paying customers exist — margin percentages aren't meaningful until there's revenue to measure against.`
        : `No revenue and no provider cost recorded this month yet.`,
    });
    return suggestions;
  }

  // 1. Per-plan margin against the spec's targets — the most direct
  //    signal that a tier is priced wrong for what it actually costs.
  for (const [plan, v] of Object.entries(input.byPlan)) {
    const target = TARGET_MARGIN_PCT[plan as PlanKey];
    if (!target || v.revenueInr <= 0) continue;

    const margin = ((v.revenueInr - v.costInr) / v.revenueInr) * 100;
    if (margin >= target.min) continue;

    const shortfall = target.min - margin;
    suggestions.push({
      id: `plan_margin_${plan}`,
      severity: margin < 0 ? "critical" : shortfall > 20 ? "warning" : "info",
      title: `${plan} plan is running at ${pct(margin)} margin`,
      detail: `${v.dealerships} ${v.dealerships === 1 ? "business" : "businesses"} · ${inr(v.revenueInr)} revenue against ${inr(v.costInr)} cost. Target for this tier is ${target.min}–${target.max}%. ${
        margin < 0
          ? "This tier is currently losing money on every customer — either the price is too low for what it includes, or its usage caps are too generous."
          : `About ${pct(shortfall)} below target — worth checking whether this tier's caps are too generous for its price.`
      }`,
    });
  }

  // 2. Individual businesses costing more than they pay. More
  //    actionable than an aggregate: these are specific accounts.
  const lossMaking = input.perDealership
    .filter((d) => d.exactCostInr > d.revenueInr && d.revenueInr > 0)
    .sort((a, b) => (b.exactCostInr - b.revenueInr) - (a.exactCostInr - a.revenueInr))
    .slice(0, 5);

  if (lossMaking.length > 0) {
    const worst = lossMaking[0];
    suggestions.push({
      id: "loss_making_accounts",
      severity: "warning",
      title: `${lossMaking.length} paying ${lossMaking.length === 1 ? "business costs" : "businesses cost"} more than they pay`,
      detail: `Biggest gap: ${worst.name} (${worst.plan}) — ${inr(worst.exactCostInr)} cost against ${inr(worst.revenueInr)} revenue. ${
        lossMaking.length > 1 ? `Others: ${lossMaking.slice(1).map((d) => d.name).join(", ")}. ` : ""
      }Per-client caps (Client Limits) can bound this without changing their plan.`,
    });
  }

  // 3. Free-tier cost. Free users are a real, intentional acquisition
  //    cost — flagged only when it's a large share of total spend,
  //    since a small amount is just the cost of a funnel.
  const freePlan = input.byPlan.free;
  if (freePlan && freePlan.costInr > 0 && input.cogsInr > 0) {
    const share = (freePlan.costInr / input.cogsInr) * 100;
    if (share > 25) {
      suggestions.push({
        id: "free_tier_share",
        severity: share > 50 ? "warning" : "info",
        title: `Free accounts are ${pct(share)} of total provider cost`,
        detail: `${freePlan.dealerships} free ${freePlan.dealerships === 1 ? "account" : "accounts"} generating ${inr(freePlan.costInr)} of cost with no revenue. Some of this is normal acquisition cost — but if it keeps climbing, the Free tier's caps are the lever.`,
      });
    }
  }

  // 4. Cost concentration in one operation. Points at exactly where a
  //    cheaper model or a tighter cap would actually move the number,
  //    rather than suggesting generic belt-tightening.
  const operations = Object.entries(input.byOperation).sort((a, b) => b[1] - a[1]);
  if (operations.length > 0 && input.cogsInr > 0) {
    const [topOp, topCost] = operations[0];
    const share = (topCost / input.cogsInr) * 100;
    if (share > 35) {
      suggestions.push({
        id: "cost_concentration",
        severity: "info",
        title: `"${topOp.replace(/_/g, " ")}" is ${pct(share)} of provider cost`,
        detail: `${inr(topCost)} of ${inr(input.cogsInr)} total. Concentrated cost is the easiest kind to act on — worth checking whether this operation genuinely needs the model tier it's using (see aiTaskRouter.ts), or whether its usage cap is doing enough work.`,
      });
    }
  }

  // 5. Healthy state — say so plainly rather than manufacturing a
  //    finding. A suggestions list that always finds something is one
  //    people stop reading.
  if (suggestions.length === 0 && input.grossMarginPct !== null) {
    suggestions.push({
      id: "healthy",
      severity: "info",
      title: `Margins look healthy at ${pct(input.grossMarginPct)}`,
      detail: `${inr(input.revenueInr)} revenue against ${inr(input.cogsInr)} cost, with every plan tier at or above its target margin. Nothing needs attention right now.`,
    });
  }

  const order: Record<SuggestionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return suggestions.sort((a, b) => order[a.severity] - order[b.severity]);
}
