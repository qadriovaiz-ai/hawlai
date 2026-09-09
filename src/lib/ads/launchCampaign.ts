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
import { withCampaignTag, type ResolvedDestination } from "@/lib/ads/destination";

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

  /**
   * Where the ad points AND what the campaign optimises for — one
   * decision, resolved together. See destination.ts: a lead-gen
   * objective aimed at a product page is refused or mis-optimised.
   */
  destination: ResolvedDestination;
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
  destination: ResolvedDestination;
  linkUrl: string | null;
};

export async function launchPausedCampaign(ctx: LaunchContext): Promise<LaunchResult> {
  const {
    serviceClient, dealershipId, dealership, adAccount, pageAccessToken,
    pageId, leadFormId, brandProfile, plan, draft, finalBuffer, publicUrl,
    destination,
  } = ctx;

  // Tagged here rather than at each call site, so a chat launch is as
  // attributable as a page launch. draft.id is the one stable per-ad
  // identifier that exists before Meta hands back its own.
  const linkUrl = destination.url ? withCampaignTag(destination.url, draft.id) : null;

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
        // No `!` assertion. destination.url is null only for
        // instant_form, and that branch does not read it — the previous
        // version asserted non-null on a value the caller hardcoded as
        // null, and sent link: null to Meta.
        link: linkUrl ?? `https://fb.me/${pageId}`,
        call_to_action: linkUrl
          ? { type: "LEARN_MORE", value: { link: linkUrl } }
          : { type: "LEARN_MORE", value: { lead_gen_form_id: destination.leadFormId ?? leadFormId } },
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
    // Named after what is actually being advertised. The fallback used
    // to be "Cars", so a candle shop's campaign appeared in Ads Manager
    // as "Hawlai - Cars - 09/09/2026". Cosmetic, but it is the name the
    // merchant navigates by.
    name: `Hawlai - ${plan.car_type || dealership?.business_category || "Campaign"} - ${new Date().toLocaleDateString("en-IN")}`,
    objective: destination.objective,
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
    optimization_goal: destination.optimizationGoal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: built.targeting,
    status: "PAUSED",
    // Required by LEAD_GENERATION, and rejected on some objectives
    // where it does not apply — so it is sent only when the resolved
    // destination actually calls for it.
    ...(destination.promotedObject ? { promoted_object: destination.promotedObject } : {}),
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
    destination: destination.kind,
    objective: destination.objective,
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
    destination,
    linkUrl,
  };
}
