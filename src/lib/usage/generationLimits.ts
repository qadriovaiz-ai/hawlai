// Pre-generation usage caps for the handful of tools with no boolean
// on/off distinction per tier — every plan can generate images, video,
// voiceover, brand kits, and websites; the difference is how many per
// month (plan_limits.*_per_month, migration 099), not whether at all.
// Backed by monthly_generation_usage (migration 100), bucketed by
// calendar month like calling_minutes_usage. video/voiceover_chars
// additionally get a per-day layer (plan_limits.*_per_day, migration
// 125, backed by daily_generation_usage) — the two priciest-per-unit
// resources, protecting against a same-day cost spike that would
// otherwise stay technically within the monthly cap.
//
// Always uses the service-role client, same reasoning as
// checkAndRecordMessageUsage: neither usage table has an RLS policy,
// and callers here include both authenticated web routes and Master
// Chat's own server-side tool dispatch, which has no user session to
// route through anyway.

import { createServiceClient } from "@/lib/supabase/service";
import { getDealershipPlanLimits, isPlanGatingBypassed, type PlanLimits } from "@/lib/plans";
import { currentBillingMonth } from "@/lib/usage/callingMinutes";

export type GenerationResource = "image" | "video" | "voiceover_chars" | "brand_kit" | "website_build";

const RESOURCE_LIMIT_KEY: Record<GenerationResource, keyof PlanLimits> = {
  image: "imagesPerMonth",
  video: "videosPerMonth",
  voiceover_chars: "voiceoverCharsPerMonth",
  brand_kit: "brandKitsPerMonth",
  website_build: "websiteBuildsPerMonth",
};

// Only video/voiceover_chars get a daily layer on top of the monthly
// one (migration 125) — the two priciest-per-unit resources, where a
// same-day burst is the real cost risk, not just the monthly total.
// image/brand_kit/website_build have no entry here, so the daily
// check below is skipped entirely for them — exact same behavior as
// before this migration.
const RESOURCE_DAILY_LIMIT_KEY: Partial<Record<GenerationResource, keyof PlanLimits>> = {
  video: "videosPerDay",
  voiceover_chars: "voiceoverCharsPerDay",
};

const RESOURCE_LABEL: Record<GenerationResource, string> = {
  image: "image generations",
  video: "video generations",
  voiceover_chars: "voiceover characters",
  brand_kit: "brand kit generations",
  website_build: "website builds",
};

export interface GenerationLimitResult {
  allowed: boolean;
  limit: number | null; // null = unlimited
  used: number;
  resource: GenerationResource;
  period?: "daily" | "monthly"; // which limit was actually hit, only set when allowed=false
}

/**
 * Checks this month's usage of a capped generation resource against the
 * dealership's plan limit and, if allowed, records the usage — `units`
 * is 1 for count-based resources (image/video/brand_kit/website_build)
 * or the actual character count for voiceover_chars. Callers MUST run
 * this before the expensive provider call, not after — that's the whole
 * point of a pre-generation cap. Not atomic (read-then-write), same
 * accepted tradeoff as checkAndRecordMessageUsage/recordCallingMinutes —
 * a rare concurrent race could let one extra generation through, never
 * worth blocking a real request over for a soft usage cap like this.
 */
export async function checkAndRecordGenerationUsage(
  dealershipId: string,
  resource: GenerationResource,
  units: number = 1
): Promise<GenerationLimitResult> {
  // Same BYPASS_PLAN_GATING flag as hasFeature() in plans.ts — checked
  // first and short-circuits before touching monthly_generation_usage
  // at all, so testing traffic never inflates real usage counts that
  // would need cleaning up once the flag goes back off.
  if (isPlanGatingBypassed()) return { allowed: true, limit: null, used: 0, resource };

  const service = createServiceClient();
  const limits = await getDealershipPlanLimits(service, dealershipId);
  const monthlyLimit = limits[RESOURCE_LIMIT_KEY[resource]] as number | null;
  const billingMonth = currentBillingMonth();

  const dailyLimitKey = RESOURCE_DAILY_LIMIT_KEY[resource];
  const dailyLimit = dailyLimitKey ? (limits[dailyLimitKey] as number | null) : null;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: monthlyRow }, { data: dailyRow }] = await Promise.all([
    service.from("monthly_generation_usage").select("count").eq("dealership_id", dealershipId).eq("resource", resource).eq("billing_month", billingMonth).maybeSingle(),
    dailyLimitKey
      ? service.from("daily_generation_usage").select("count").eq("dealership_id", dealershipId).eq("resource", resource).eq("usage_date", today).maybeSingle()
      : Promise.resolve({ data: null as { count: number } | null }),
  ]);
  const monthlyUsed = monthlyRow?.count ?? 0;
  const dailyUsed = dailyRow?.count ?? 0;

  // Daily checked first — it's the tighter, more specific limit, so a
  // caller hitting both at once should hear about the one that's
  // actually more informative ("today" is more actionable than "this
  // month" when both are true).
  if (dailyLimitKey && dailyLimit != null && dailyUsed + units > dailyLimit) {
    return { allowed: false, limit: dailyLimit, used: dailyUsed, resource, period: "daily" };
  }
  if (monthlyLimit != null && monthlyUsed + units > monthlyLimit) {
    return { allowed: false, limit: monthlyLimit, used: monthlyUsed, resource, period: "monthly" };
  }

  const writes: PromiseLike<any>[] = [
    service.from("monthly_generation_usage").upsert(
      { dealership_id: dealershipId, resource, billing_month: billingMonth, count: monthlyUsed + units },
      { onConflict: "dealership_id,resource,billing_month" }
    ),
  ];
  if (dailyLimitKey) {
    writes.push(
      service.from("daily_generation_usage").upsert(
        { dealership_id: dealershipId, resource, usage_date: today, count: dailyUsed + units },
        { onConflict: "dealership_id,resource,usage_date" }
      )
    );
  }
  await Promise.all(writes);

  return { allowed: true, limit: monthlyLimit, used: monthlyUsed + units, resource };
}

/** Same wording pattern as checkAndRecordMessageUsage's limit message. */
export function generationLimitMessage(result: GenerationLimitResult): string {
  if (result.period === "daily") {
    return `You've hit today's limit (${result.limit} ${RESOURCE_LABEL[result.resource]}) for your plan. Try again tomorrow, or upgrade for more.`;
  }
  return `You've hit this month's limit (${result.limit} ${RESOURCE_LABEL[result.resource]}) for your plan. Upgrade for more, or try again next month.`;
}
