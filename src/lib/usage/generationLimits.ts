// Pre-generation usage caps for the handful of tools with no boolean
// on/off distinction per tier — every plan can generate images, video,
// voiceover, brand kits, and websites; the difference is how many per
// month (plan_limits.*_per_month, migration 099), not whether at all.
// Backed by monthly_generation_usage (migration 100), bucketed by
// calendar month like calling_minutes_usage.
//
// Always uses the service-role client, same reasoning as
// checkAndRecordMessageUsage: monthly_generation_usage has no RLS
// policy, and callers here include both authenticated web routes and
// Master Chat's own server-side tool dispatch, which has no user
// session to route through anyway.

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
  const limit = limits[RESOURCE_LIMIT_KEY[resource]] as number | null;
  const billingMonth = currentBillingMonth();

  const { data: row } = await service
    .from("monthly_generation_usage")
    .select("count")
    .eq("dealership_id", dealershipId)
    .eq("resource", resource)
    .eq("billing_month", billingMonth)
    .maybeSingle();
  const used = row?.count ?? 0;

  if (limit != null && used + units > limit) {
    return { allowed: false, limit, used, resource };
  }

  await service.from("monthly_generation_usage").upsert(
    { dealership_id: dealershipId, resource, billing_month: billingMonth, count: used + units },
    { onConflict: "dealership_id,resource,billing_month" }
  );

  return { allowed: true, limit, used: used + units, resource };
}

/** Same wording pattern as checkAndRecordMessageUsage's limit message. */
export function generationLimitMessage(result: GenerationLimitResult): string {
  return `You've hit this month's limit (${result.limit} ${RESOURCE_LABEL[result.resource]}) for your plan. Upgrade for more, or try again next month.`;
}
