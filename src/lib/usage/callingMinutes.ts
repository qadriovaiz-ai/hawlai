// Tracks AI calling minutes per business per billing month
// (calling_minutes_usage, migration 079) and computes the extra charge
// once a business goes past its plan's free calling minutes. Always
// uses the service-role client — calling_minutes_usage has no RLS
// policy yet, and this is called from the Vapi webhook, which has no
// user session anyway.

import { createServiceClient } from "@/lib/supabase/service";
import { getDealershipPlanLimits } from "@/lib/plans";
import { costOfCallingOverageInr } from "@/lib/usage/pricing";

export interface CallingMinutesResult {
  minutesUsed: number;
  extraMinutesCharged: number;
  extraChargeInr: number;
}

export function currentBillingMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Adds a completed call's duration to this month's calling_minutes_usage
 * and, if it pushes the business past its plan's free minutes, tallies
 * the extra charge for the portion that's over. Not atomic (read-then-
 * write) — same tradeoff as message-limit tracking; acceptable since
 * this only feeds a billing display, not a hard cutoff.
 */
export async function recordCallingMinutes(dealershipId: string, callDurationSeconds: number): Promise<CallingMinutesResult | null> {
  if (callDurationSeconds <= 0) return null;

  const service = createServiceClient();
  const limits = await getDealershipPlanLimits(service, dealershipId);
  const billingMonth = currentBillingMonth();
  const callMinutes = callDurationSeconds / 60;

  const { data: row } = await service
    .from("calling_minutes_usage")
    .select("minutes_used, extra_minutes_charged, extra_charge_inr")
    .eq("dealership_id", dealershipId)
    .eq("billing_month", billingMonth)
    .maybeSingle();

  const priorMinutesUsed = row?.minutes_used ?? 0;
  const priorExtraMinutes = row?.extra_minutes_charged ?? 0;
  const priorExtraChargeInr = row?.extra_charge_inr ?? 0;

  const newMinutesUsed = priorMinutesUsed + callMinutes;
  const freeMinutes = limits.callingFreeMinutes;

  // Only the slice of THIS call that crosses the free allowance counts
  // as extra — handles a call that starts under the limit and ends over it.
  const extraMinutesThisCall = Math.max(0, newMinutesUsed - freeMinutes) - Math.max(0, priorMinutesUsed - freeMinutes);
  const extraChargeThisCall = extraMinutesThisCall > 0 ? costOfCallingOverageInr(extraMinutesThisCall, limits.callingMarginInr) : 0;

  const result: CallingMinutesResult = {
    minutesUsed: Math.round(newMinutesUsed * 100) / 100,
    extraMinutesCharged: Math.round((priorExtraMinutes + extraMinutesThisCall) * 100) / 100,
    extraChargeInr: Math.round((priorExtraChargeInr + extraChargeThisCall) * 100) / 100,
  };

  await service.from("calling_minutes_usage").upsert(
    { dealership_id: dealershipId, billing_month: billingMonth, minutes_used: result.minutesUsed, extra_minutes_charged: result.extraMinutesCharged, extra_charge_inr: result.extraChargeInr },
    { onConflict: "dealership_id,billing_month" }
  );

  return result;
}
