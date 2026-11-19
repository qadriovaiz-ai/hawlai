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
import { frequencyCapFor } from "@/lib/retargeting/messages";
import { metaLog, metaError } from "@/lib/ads/metaLog";
import { clampBudgetToMinimum } from "@/lib/ads/adAccountLimits";
import { preflight, preflightMessage } from "@/lib/ads/preflight";
import { dryRun, dryRunMessage } from "@/lib/ads/dryRun";
import {
  declarationFor,
  financeEvidence,
  targetsIndia,
  specialCategoryEvidence,
  specialDeclarationFor,
  SPECIAL_CATEGORY_QUESTION,
  type SpecialCategory,
} from "@/lib/ads/regulatedCategory";
import { readInstagramIdentity, withInstagramIdentity, placementNote } from "@/lib/ads/instagramIdentity";
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
  /** Audiences the ad must never reach — the business's converters (R3). */
  excludeAudienceIds?: string[];
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
  /**
   * Where this ad will actually appear, in one sentence. Said in BOTH
   * directions: an owner who expected Instagram and got silence cannot
   * tell a missing feature from a broken one.
   */
  placement: string;
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
  const baseCreative = {
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
  };

  // ───────────────────────────────────────────────────────────────────
  // THE INSTAGRAM IDENTITY, PROVEN BEFORE IT IS USED
  // ───────────────────────────────────────────────────────────────────
  //
  // `instagram_user_id` replaced `instagram_actor_id` in Marketing API
  // v22.0, and we are on v23.0. Neither name has ever appeared in this
  // repository, so ads have been Facebook-only by omission.
  //
  // AND A GAP COMMIT 5 LEFT. The dry run validates the campaign, the ad
  // set and the ad — but the CREATIVE is created before all three and
  // was never validated at all. Adding an untested field to an
  // unvalidated real POST is how a working launch flow breaks for
  // everybody at once. So the creative is dry-run first, which is also
  // the demonstration that Meta accepts the field: it validates the
  // exact spec about to be sent, and creates nothing.
  //
  // AN ABSENT OR REFUSED INSTAGRAM NEVER STOPS THE AD. If Meta will not
  // take the spec WITH the identity, the same spec is validated WITHOUT
  // it; if that passes, the ad goes out Facebook-only and the owner is
  // told in a sentence. An optional identity that can fail a launch is
  // worse than no identity at all.
  const instagram = await readInstagramIdentity(pageId, pageAccessToken, dealershipId);
  let creativeSpec: Record<string, any> = withInstagramIdentity(baseCreative, instagram);
  let placement = placementNote(instagram);

  const creativeCheck = await dryRun(`${adAccount}/adcreatives`, creativeSpec, pageAccessToken, {
    stage: "creative",
    dealershipId,
  });

  if (!creativeCheck.ok && !creativeCheck.inconclusive) {
    // Refused. Was the identity the reason? Ask Meta rather than
    // parsing its error text — the same spec minus one field is a
    // clean experiment, and still creates nothing.
    //
    // ONE THROW, DELIBERATELY. The first version had two — one for a
    // refusal with Instagram attached and one for a refusal without —
    // and a mutation check caught that the test could not tell them
    // apart, because `throw new Error(dryRunMessage(creativeCheck...` 
    // occurred twice and a grep was satisfied by either. Deleting the
    // no-Instagram branch let a launch proceed on a spec Meta had
    // rejected, and every test still passed. One exit, one assertion.
    const withoutIg = instagram
      ? await dryRun(`${adAccount}/adcreatives`, baseCreative, pageAccessToken, {
          stage: "creative.no_instagram",
          dealershipId,
        })
      : { ok: false, inconclusive: false, reason: null };

    if (withoutIg.ok && instagram) {
      metaLog("launch.instagram_dropped", { dealership: dealershipId, instagram: instagram.id });
      creativeSpec = baseCreative;
      placement = placementNote(null, "refused");
    } else {
      throw new Error(dryRunMessage(creativeCheck, "ad creative") ?? "Meta rejected this ad's creative.");
    }
  }

  const creativeRes = await metaPost(`${adAccount}/adcreatives`, creativeSpec, pageAccessToken);

  // WHAT THIS BUSINESS ACTUALLY SELLS, from its own records — never
  // from the ad copy, which a model wrote and which would let a
  // generic headline vouch for any interest at all.
  //
  // A CATALOGUE THAT CANNOT BE READ IS NOT AN EMPTY ONE, AND NEITHER
  // IS A REASON TO FAIL THE LAUNCH. It means this run cannot judge
  // whether an interest is relevant — so no interest is applied and the
  // ad goes out broad, which is the safe direction and the one a small
  // budget wants anyway. An ad the owner approved must not die because
  // a products query did.
  let catalogue: { name?: string | null; category?: string | null }[] = [];
  try {
    const { data } = await serviceClient
      .from("products")
      .select("name, category")
      .eq("dealership_id", dealershipId)
      .eq("is_active", true)
      .limit(25);
    if (Array.isArray(data)) catalogue = data;
  } catch {
    metaLog("launch.catalogue_unreadable", { dealership: dealershipId });
  }

  const vocabulary = [
    ...catalogue.flatMap((p) => [p?.name, p?.category]),
    dealership?.business_category,
  ].filter((w: unknown): w is string => typeof w === "string" && w.trim().length > 0);

  const built = await buildMetaTargeting({
    businessCategory: dealership?.business_category,
    vocabulary,
    persona: brandProfile?.target_persona ?? null,
    location: ctx.targetingLocation ?? null,
    aiSuggestedCity: plan.targeting_city,
    accessToken: pageAccessToken,
    customAudienceIds: ctx.retargetAudienceIds ?? [],
    excludedCustomAudienceIds: ctx.excludeAudienceIds ?? [],
  });

  // THE SECOND PRE-FLIGHT, and the reason there are two.
  //
  // Targeting does not exist until buildMetaTargeting has resolved a
  // city against Meta's own taxonomy, so these rules cannot run in the
  // route with the rest. They run here, before the campaign POST —
  // which is the first call that creates anything that can spend.
  //
  // An ad set Meta refuses leaves a campaign already created and
  // orphaned in Ads Manager, which is where "New Sales ad set"-looking
  // debris comes from. Refusing one frame earlier leaves nothing.
  // META'S REGIONAL REGULATED CATEGORIES — decided from the business's
  // OWN words, and never decided silently. Evidence raises a question
  // and stops the launch; its absence sends no field at all, which is
  // the unticked box in Ads Manager.
  const regulated = declarationFor({
    india: targetsIndia(built.targeting),
    evidence: financeEvidence([
      { label: "Your ad text", text: `${plan.headline ?? ""} ${plan.body ?? ""}` },
      { label: "The category on your profile", text: dealership?.business_category },
    ]),
  });

  // META'S SPECIAL AD CATEGORIES. An exact category match is already
  // certain and declares itself, exactly as before. Otherwise the
  // owner's recorded answer decides, and if there is evidence and no
  // answer the launch stops and asks — once, ever.
  const evidence = specialCategoryEvidence([
    { label: "The category on your profile", text: dealership?.business_category },
    { label: "Your ad text", text: `${plan.headline ?? ""} ${plan.body ?? ""}` },
  ]);
  const special = specialDeclarationFor({
    // `built.specialAdCategory` IS the exact match — buildMetaTargeting
    // has already run isSpecialAdCategory and returns "NONE" or the
    // category. Calling it again here would be a second source of the
    // same truth, and the two could disagree.
    exact: built.specialAdCategory !== "NONE" ? built.specialAdCategory : null,
    evidence,
    ownerAnswer: await readSpecialCategoryAnswer(serviceClient, dealershipId, evidence.category),
  });

  const targetingChecks = preflight({
    targeting: { targeting: built.targeting, specialAdCategory: built.specialAdCategory },
    regulated,
    special,
  });
  if (!targetingChecks.ok) {
    metaError("launch.preflight_failed", {
      dealership: dealershipId,
      stage: "targeting",
      problems: targetingChecks.problems.map((p) => p.key).join(","),
    });
    throw new Error(preflightMessage(targetingChecks) ?? "This ad can't be launched as configured.");
  }

  // Step 5: campaign
  //
  // THE SPEC IS BUILT ONCE AND USED TWICE — validated, then created.
  // Two separately written bodies would eventually drift, and a dry run
  // that validates a different campaign from the one being made is
  // worse than none at all: it reports a pass for something that was
  // never checked.
  const campaignSpec = {
    // Named after what is actually being advertised. The fallback used
    // to be "Cars", so a candle shop's campaign appeared in Ads Manager
    // as "Hawlai - Cars - 09/09/2026". Cosmetic, but it is the name the
    // merchant navigates by.
    name: `Hawlai - ${plan.car_type || dealership?.business_category || "Campaign"} - ${new Date().toLocaleDateString("en-IN")}`,
    objective: destination.objective,
    status: "PAUSED",
    // `built.specialAdCategory` is "NONE" or an exact match. A category
    // the OWNER confirmed overrides it — that is the whole point of
    // asking, and without this the answer would be recorded and then
    // ignored.
    special_ad_categories: [special.kind === "declare" ? special.value : built.specialAdCategory],
    is_adset_budget_sharing_enabled: false,
  };

  // THE ONE DRY RUN THAT PREVENTS EVERYTHING. A campaign has no parent,
  // so this can be asked before anything at all exists — and a refusal
  // here means nothing was created, not even an empty campaign.
  const campaignCheck = await dryRun(`${adAccount}/campaigns`, campaignSpec, pageAccessToken, {
    stage: "campaign",
    dealershipId,
  });
  if (!campaignCheck.ok && !campaignCheck.inconclusive) {
    throw new Error(dryRunMessage(campaignCheck, "campaign") ?? "Meta rejected this campaign.");
  }

  const campaignRes = await metaPost(`${adAccount}/campaigns`, campaignSpec, pageAccessToken);

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
  const adsetSpec = {
    name: `${plan.headline} - AdSet`,
    campaign_id: campaignRes.id,
    daily_budget: budget.minor,
    billing_event: "IMPRESSIONS",
    optimization_goal: destination.optimizationGoal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: built.targeting,
    // A frequency cap, where Meta takes one at all — it accepts them on
    // reach campaigns only, so a Traffic or Leads ad set gets none and the
    // Retargeting page says so (lib/retargeting/messages.ts).
    ...(frequencyCapFor(destination.objective) ? { frequency_control_specs: frequencyCapFor(destination.objective)!.specs } : {}),
    status: "PAUSED",
    // Required by LEAD_GENERATION, and rejected on some objectives
    // where it does not apply — so it is sent only when the resolved
    // destination actually calls for it.
    ...(destination.promotedObject ? { promoted_object: destination.promotedObject } : {}),
    ...(ctx.scheduledStart ? { start_time: new Date(ctx.scheduledStart).toISOString() } : {}),
    // ONLY WHEN IT HAS BEEN ESTABLISHED, NEVER INFERRED. An ordinary
    // business sends no field — the same as leaving the box unticked,
    // which is the state Meta accepted on 19 November 2026. A business
    // that looks regulated never reaches here: preflight refused above.
    ...(regulated.kind === "declare" ? { regional_regulated_categories: [regulated.value] } : {}),
  };

  // The ad set is where most refusals happen — budget, targeting,
  // promoted object, regional regulation. The campaign already exists
  // by now, so this cannot prevent an empty one being left behind; what
  // it prevents is the owner being handed a Graph error code instead of
  // a sentence.
  const adsetCheck = await dryRun(`${adAccount}/adsets`, adsetSpec, pageAccessToken, { stage: "adset", dealershipId });
  if (!adsetCheck.ok && !adsetCheck.inconclusive) {
    throw new Error(dryRunMessage(adsetCheck, "ad set") ?? "Meta rejected this ad set.");
  }

  const adsetRes = await metaPost(`${adAccount}/adsets`, adsetSpec, pageAccessToken);

  // Step 7: the ad itself
  const adSpec = {
    name: plan.headline,
    adset_id: adsetRes.id,
    creative: { creative_id: creativeRes.id },
    status: "PAUSED",
  };

  // REVIEW: TRUE, AND ONLY HERE. synchronous_ad_review runs Meta's Ads
  // Integrity checks — message language, the image text rule, the rest
  // of the policy logic — and those are judgements about the CREATIVE.
  // Asking for them on a campaign or an ad set would be asking about an
  // object that carries no copy and no image.
  //
  // This is the check that otherwise arrives as a DISAPPROVED ad hours
  // after launch, with the owner's money already committed to it.
  const adCheck = await dryRun(`${adAccount}/ads`, adSpec, pageAccessToken, { stage: "ad", review: true, dealershipId });
  if (!adCheck.ok && !adCheck.inconclusive) {
    throw new Error(dryRunMessage(adCheck, "ad") ?? "Meta rejected this ad.");
  }

  const adRes = await metaPost(`${adAccount}/ads`, adSpec, pageAccessToken);

  const targetingJson = {
    ...built.targeting,
    summary: built.summary,
    personaApplied: built.personaApplied,
    specialAdCategory: built.specialAdCategory,
  };

  const { data: updated, error: updateError } = await serviceClient
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

  // THE LOCAL RECORD IS THE DASHBOARD'S ONLY SOURCE. Both campaign
  // queries filter on status = 'launched', so if this update does not
  // land the row stays a draft and the merchant sees "No campaigns
  // launched yet" beside a campaign that genuinely exists on Meta —
  // with launch.done in the log saying it worked.
  //
  // The error was previously not even destructured. Same shape as the
  // unchecked storage upload: Supabase returns { data, error } and does
  // not throw, so a failed write read as a successful one.
  //
  // Thrown, not swallowed: the objects on Meta are real and paused, and
  // an executor that reports success while the row says draft leaves
  // nobody able to find or stop them.
  if (updateError || !updated) {
    metaError("launch.row_not_saved", {
      dealership: dealershipId,
      draft: draft.id,
      campaign: campaignRes.id,
      ad: adRes.id,
      detail: updateError?.message ?? "the update matched no row",
    });
    throw new Error(
      `The campaign was created on Meta (${campaignRes.id}) but couldn't be saved to your dashboard: ${updateError?.message ?? "the record was not found"}`
    );
  }

  metaLog("launch.done", {
    dealership: dealershipId,
    destination: destination.kind,
    objective: destination.objective,
    // Whether the local record actually saved. Its absence is what
    // makes a live campaign invisible in the product.
    row_saved: true,
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
    placement,
    targetingJson,
    destination,
    linkUrl,
  };
}

/**
 * What the owner said, when they have been asked.
 *
 * `undefined` means never answered — which is what makes the launch
 * stop and ask. `null` means they said none of the three applies, and
 * that is an answer: it is never asked again and the ad launches.
 *
 * A YES BECOMES THE CATEGORY THE EVIDENCE POINTED AT. The question is
 * one yes/no covering all three, because the registry's prompts are
 * industry-neutral by rule and a three-way choice would have to name
 * the trades. The evidence already says which one it saw, and the
 * owner has just confirmed that it saw correctly.
 *
 * NEVER THROWS. An unreadable answers table means nobody has answered
 * as far as this can tell, which stops the launch rather than guessing
 * — the safe direction for a declaration that is legally enforced.
 */
async function readSpecialCategoryAnswer(
  supabase: any,
  dealershipId: string,
  evidenceCategory: SpecialCategory | null
): Promise<SpecialCategory | null | undefined> {
  try {
    const { data } = await supabase
      .from("interview_answers")
      .select("status, answer")
      .eq("dealership_id", dealershipId)
      .eq("question_key", SPECIAL_CATEGORY_QUESTION)
      .maybeSingle();
    if (!data || data.status !== "answered") return undefined;
    const said = String(data.answer ?? "").trim().toLowerCase();
    if (!said) return undefined;
    const yes = said === "yes" || said === "true" || said === "haan";
    return yes ? evidenceCategory : null;
  } catch {
    return undefined;
  }
}
