// The five Meta Graph calls that create a campaign, in one place.
//
// EXTRACTED FROM /api/ads/adlaunch, unchanged in behaviour. It moved
// here because Master Chat now needs to launch too, and the only
// alternative was a second copy of the sequence — two places that both
// have to keep PAUSED-on-create, the budget clamp and the [meta]
// stages correct, forever. The route is now a thin caller; so is the
// publish platform module.
//
// EVERYTHING IS CREATED PAUSED. Campaign, ad set and ad. Meta bills on
// the ad's effective status, so all three matter and
// adLaunchPaused.test.ts asserts that no call carries any other status.
//
// This function does NOT decide whether the launch is allowed. The
// account-status gate and the human approval live above it — here the
// decision has already been made.

import { metaPost } from "@/lib/adEngine";
import { buildMetaTargeting } from "@/lib/ads/metaTargeting";
import { metaLog } from "@/lib/ads/metaLog";
import { clampBudgetToMinimum } from "@/lib/ads/adAccountLimits";

export type LaunchContext = {
  serviceClient: any;
  dealershipId: string;
  /** The dealerships row: business_category and the cached fb_* limit columns. */
  dealership: any;
  adAccount: string;
  pageAccessToken: string;
  pageId: string;
  leadFormId?: string | null;
  brandProfile?: any;

  /** The approved plan. NEVER regenerated here — this is what the human said yes to. */
  plan: any;
  /** The ad_creatives draft row this launch belongs to. */
  draft: any;
  /** The creative image bytes, already built. */
  finalBuffer: Buffer;
  /** Where that image lives in our own storage. */
  publicUrl: string;

  adDestination: "instant_form" | "website";
  destinationUrl: string | null;
  targetingLocation?: any;
  retargetAudienceIds?: string[];
  scheduledStart?: string | null;
  variantGroupId?: string | null;
  variantLabel?: string | null;
};

export type LaunchResult = {
  campaignId: string;
  adsetId: string;
  adId: string;
  creativeId: string;
  updated: any;
  budget: { minor: number; raised: boolean; from: number };
  targetingSummary: string;
  targetingJson: Record<string, any>;
};

export async function launchPausedCampaign(ctx: LaunchContext): Promise<LaunchResult> {
  const {
    serviceClient, dealershipId, dealership, adAccount, pageAccessToken,
    pageId, leadFormId, brandProfile, plan, draft, finalBuffer, publicUrl,
    adDestination, destinationUrl,
  } = ctx;

  // Step 3: upload the image to Meta and get an image_hash
  const uploadRes = await metaPost(`${adAccount}/adimages`, {
    bytes: finalBuffer.toString("base64"),
  }, pageAccessToken);
  const first = Object.values(uploadRes.images ?? {})[0] as any;
  const imageHash = first && first.hash;
  if (!imageHash) throw new Error("Meta didn't return an image hash");

  // Step 4: the ad creative — Instant Form (stays inside Facebook) or
  // an external website/landing page.
  const creativeRes = await metaPost(`${adAccount}/adcreatives`, {
    name: `${plan.headline} - Creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        image_hash: imageHash,
        message: plan.body,
        name: plan.headline,
        link: adDestination === "website" ? destinationUrl! : `https://fb.me/${pageId}`,
        call_to_action:
          adDestination === "website"
            ? { type: "LEARN_MORE", value: { link: destinationUrl } }
            : { type: "LEARN_MORE", value: { lead_gen_form_id: leadFormId } },
      },
    },
  }, pageAccessToken);

  const built = await buildMetaTargeting({
    businessCategory: dealership?.business_category,
    persona: brandProfile?.target_persona ?? null,
    location: ctx.targetingLocation ?? null,
    aiSuggestedCity: plan.targeting_city,
    accessToken: pageAccessToken,
    customAudienceIds: ctx.retargetAudienceIds ?? [],
  });

  // Step 5: campaign
  const campaignRes = await metaPost(`${adAccount}/campaigns`, {
    name: `Hawlai - ${plan.car_type ?? "Cars"} - ${new Date().toLocaleDateString("en-IN")}`,
    objective: "OUTCOME_LEADS",
    status: "PAUSED",
    special_ad_categories: [built.specialAdCategory],
    is_adset_budget_sharing_enabled: false,
  }, pageAccessToken);

  // The account's real floor. Meta rejects an under-floor ad set HERE,
  // with a campaign already created and a creative already uploaded,
  // and its error names neither the floor nor the fix.
  const budget = clampBudgetToMinimum(
    Math.round((plan.daily_budget ?? 500) * 100),
    dealership?.fb_min_daily_budget
  );
  if (budget.raised) {
    metaLog("launch.budget_raised", {
      dealership: dealershipId,
      from_minor: budget.from,
      to_minor: budget.minor,
      currency: dealership?.fb_currency ?? null,
    });
  }

  // Step 6: ad set (targeting + budget)
  const adsetRes = await metaPost(`${adAccount}/adsets`, {
    name: `${plan.headline} - AdSet`,
    campaign_id: campaignRes.id,
    daily_budget: budget.minor,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: built.targeting,
    status: "PAUSED",
    promoted_object: { page_id: pageId },
    ...(ctx.scheduledStart ? { start_time: new Date(ctx.scheduledStart).toISOString() } : {}),
  }, pageAccessToken);

  // Step 7: the ad itself
  const adRes = await metaPost(`${adAccount}/ads`, {
    name: plan.headline,
    adset_id: adsetRes.id,
    creative: { creative_id: creativeRes.id },
    status: "PAUSED",
  }, pageAccessToken);

  const targetingJson = {
    ...built.targeting,
    summary: built.summary,
    personaApplied: built.personaApplied,
    specialAdCategory: built.specialAdCategory,
  };

  const { data: updated } = await serviceClient
    .from("ad_creatives")
    .update({
      generated_image_url: publicUrl,
      status: "launched",
      meta_ad_id: adRes.id,
      meta_campaign_id: campaignRes.id,
      meta_adset_id: adsetRes.id,
      meta_status: "PAUSED",
      // Dual-write during the multi-platform transition (migration
      // 140) — meta_* stays authoritative for existing Meta code,
      // external_* is what new/generic code reads.
      platform: "meta",
      external_ad_id: adRes.id,
      external_campaign_id: campaignRes.id,
      external_adset_id: adsetRes.id,
      external_status: "PAUSED",
      daily_budget: budget.minor / 100,
      targeting_city: plan.targeting_city ?? null,
      targeting_json: targetingJson,
      scheduled_start: ctx.scheduledStart ? new Date(ctx.scheduledStart).toISOString() : null,
      ...(ctx.variantGroupId && { variant_group_id: ctx.variantGroupId, variant_label: ctx.variantLabel ?? null }),
    })
    .eq("id", draft.id)
    .select()
    .single();

  metaLog("launch.done", {
    dealership: dealershipId,
    draft: draft.id,
    campaign: campaignRes.id,
    adset: adsetRes.id,
    ad: adRes.id,
    creative: creativeRes.id,
    status: "PAUSED",
    budget_paise: budget.minor,
  });

  return {
    campaignId: campaignRes.id,
    adsetId: adsetRes.id,
    adId: adRes.id,
    creativeId: creativeRes.id,
    updated,
    budget,
    targetingSummary: built.summary,
    targetingJson,
  };
}
