// Research Credits — Usage/Pricing/Cost-Control spec, Section 7.
//
// "Do NOT permanently define 1 credit = X API tokens, because
// providers have different billing models. Instead calculate credits
// based on provider cost, search count, tokens, research depth,
// provider used." So credits are derived from REAL cost after a
// request completes (via pricing.ts's existing cost functions — never
// duplicated here), converted through ONE tunable INR-per-credit rate.
// That rate is the single number that would ever need retuning if
// margins change or a provider's pricing shifts — the actual point of
// this abstraction, per the spec's own stated goal.
//
// Soft-tracked only, same as calling_minutes_usage (migration 079):
// recorded and displayed, never blocks execution on its own. Hard
// enforcement is UsageGuard/CostGuard — explicitly Phase 3, not this
// piece.
//
// CREDIT_VALUE_INR is an internal implementation constant and must
// NEVER be rendered in customer-facing UI (Section 16 — never expose
// internal provider costs). Customer surfaces show credit counts only.

import { createServiceClient } from "@/lib/supabase/service";
import { isPlanGatingBypassed } from "@/lib/plans";
import { getEffectiveLimits } from "@/lib/usage/effectiveLimits";

const CREDIT_VALUE_INR = 1;

/** Real cost in INR -> credits, rounded up, minimum 1 per request (a request that used any provider capacity always shows as at least 1 credit — never a confusing "0 credits used" for a real call). */
export function computeResearchCredits(costInr: number): number {
  return Math.max(1, Math.ceil(costInr / CREDIT_VALUE_INR));
}

export function currentBillingMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Records credits consumed by one research call. Not atomic (read-
 * then-write) — same accepted tradeoff as recordCallingMinutes;
 * acceptable since this only feeds a usage display, not a hard cutoff.
 */
export async function recordResearchCredits(dealershipId: string, costInr: number): Promise<void> {
  const credits = computeResearchCredits(costInr);
  const service = createServiceClient();
  const billingMonth = currentBillingMonth();

  try {
    const { data: row } = await service
      .from("research_credits_usage")
      .select("credits_used")
      .eq("dealership_id", dealershipId)
      .eq("billing_month", billingMonth)
      .maybeSingle();

    const newTotal = (row?.credits_used ?? 0) + credits;
    await service.from("research_credits_usage").upsert(
      { dealership_id: dealershipId, billing_month: billingMonth, credits_used: newTotal, updated_at: new Date().toISOString() },
      { onConflict: "dealership_id,billing_month" }
    );
  } catch (err: any) {
    // Best-effort — never let credit-tracking failure break the
    // research call that already succeeded.
    console.error("[researchCredits] recordResearchCredits failed:", err.message);
  }
}

export interface ResearchCreditCheck {
  allowed: boolean;
  limit: number | null; // null = unlimited
  used: number;
}

/**
 * Pre-call enforcement (Phase 3a) — hard-blocks once the plan's monthly
 * credit allowance is spent, matching how every other capped resource
 * here already behaves (generation caps, message limits).
 *
 * GENUINE TENSION worth naming: credits can only be computed AFTER a
 * call completes, because they're derived from that call's real
 * provider cost (Section 7's whole point). So this checks the balance
 * BEFORE, and recordResearchCredits() writes the actual amount AFTER.
 * A business sitting just under their limit can therefore overshoot on
 * their final call. That's the same accepted read-then-write tradeoff
 * as checkAndRecordGenerationUsage/checkAndRecordMessageUsage, and the
 * overshoot is bounded by one request — never worth pre-charging a
 * guessed amount and then reconciling, which would make every usage
 * number an estimate rather than the real cost.
 */
export async function checkResearchCredits(dealershipId: string): Promise<ResearchCreditCheck> {
  // Same short-circuit as generation caps — testing traffic never
  // touches real usage counts.
  if (isPlanGatingBypassed()) return { allowed: true, limit: null, used: 0 };

  const service = createServiceClient();
  const [limits, { data: row }] = await Promise.all([
    getEffectiveLimits(service, dealershipId),
    service
      .from("research_credits_usage")
      .select("credits_used")
      .eq("dealership_id", dealershipId)
      .eq("billing_month", currentBillingMonth())
      .maybeSingle(),
  ]);

  const used = Number(row?.credits_used ?? 0);
  const limit = limits.researchCreditsPerMonth;
  return { allowed: limit == null || used < limit, limit, used };
}

export function researchCreditsLimitMessage(result: ResearchCreditCheck): string {
  return `You've used this month's research allowance (${result.limit} credits) for your plan. Upgrade for more, or try again next month.`;
}

export interface ResearchCreditsBalance {
  creditsUsed: number;
  creditsIncluded: number | null; // null = unlimited
  creditsRemaining: number | null;
}

/** For the customer-facing Usage & Billing dashboard (Section 16) — credit counts only, never the underlying INR value. */
export async function getResearchCreditsBalance(supabase: any, dealershipId: string): Promise<ResearchCreditsBalance> {
  const [limits, { data: row }] = await Promise.all([
    // Effective, not plan — a client capped below their tier must see
    // the real ceiling they're operating under, not a plan number
    // they can never actually reach (confirmed transparency decision).
    getEffectiveLimits(supabase, dealershipId),
    supabase
      .from("research_credits_usage")
      .select("credits_used")
      .eq("dealership_id", dealershipId)
      .eq("billing_month", currentBillingMonth())
      .maybeSingle(),
  ]);

  const creditsUsed = row?.credits_used ?? 0;
  const creditsIncluded = limits.researchCreditsPerMonth;
  return {
    creditsUsed,
    creditsIncluded,
    creditsRemaining: creditsIncluded === null ? null : Math.max(0, creditsIncluded - creditsUsed),
  };
}
