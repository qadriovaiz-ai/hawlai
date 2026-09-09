// Meta as a PublishPlatform.
//
// THE ONLY PLACE A CHAT-INITIATED CAMPAIGN REACHES META. It sits on
// the same spine as the Shopify price change — propose, preview, a
// human approves on an inline card, then execute — rather than a
// parallel mechanism, because a second approval system is how one of
// them ends up weaker than the other.
//
// WHAT PREVIEW DOES NOT DO: generate the creative. The ad_creatives
// draft (plan copy + AI image) is built by the caller and handed over
// as targetRef, exactly as Shopify's variant id is resolved before
// createPublishAction is called. create.ts documents that boundary:
// resolution is a conversational concern, and burying it in the
// platform module would mean guessing where a question was the right
// answer. Here the equivalent is "which creative did you approve" —
// it must exist and be seen BEFORE anyone says yes.
//
// WHAT EXECUTE MUST NEVER DO: regenerate the plan or the image. The
// human approved a specific headline, a specific picture and a
// specific budget. Execute reads that exact draft back and launches
// it. A regenerated creative would mean the ad that runs is not the
// ad that was approved — the same class of failure the price path's
// before-value re-verification exists to prevent.

import {
  type PublishPlatform,
  type PublishActionRecord,
  type PreviewResult,
  type ExecuteResult,
  type ActionKey,
} from "@/lib/publish/types";
import { publishLog, publishError } from "@/lib/publish/log";
import { launchPausedCampaign } from "@/lib/ads/launchCampaign";
import { readMetaPageToken } from "@/lib/crypto/oauthSecrets";
import { resolveAdDestination, type ResolvedDestination } from "@/lib/ads/destination";
import {
  getAdAccountLimits,
  isAccountUsable,
  clampBudgetToMinimum,
  describeMinimum,
  formatMinorAmount,
} from "@/lib/ads/adAccountLimits";

const CONNECTION_SELECT =
  "business_category, external_website_url, fb_page_id, fb_lead_form_id, fb_ad_account_id, fb_page_access_token, fb_page_access_token_encrypted, fb_min_daily_budget, fb_currency, fb_account_status, fb_limits_checked_at";

export type MetaPlatformDeps = {
  supabase: any;
};

export function createMetaPlatform(deps: MetaPlatformDeps): PublishPlatform {
  const { supabase } = deps;

  async function connection(dealershipId: string) {
    const { data } = await supabase
      .from("dealerships")
      .select(CONNECTION_SELECT)
      .eq("id", dealershipId)
      .maybeSingle();
    return data ?? null;
  }

  /**
   * Where this ad points, and therefore what it optimises for.
   *
   * Resolved identically in preview and execute so the merchant cannot
   * approve one destination and have another launch. The product URL
   * rides on requestedChanges because it was resolved conversationally,
   * alongside the photo, before the action existed.
   */
  async function destinationFor(action: PublishActionRecord, row: any): Promise<{ ok: true; destination: ResolvedDestination } | { ok: false; reason: string }> {
    const asked = (action.requestedChanges ?? {}) as Record<string, any>;

    let landingPageUrl: string | null = null;
    if (!asked.product_url && !row.external_website_url) {
      const { data: page } = await supabase
        .from("landing_pages")
        .select("slug, published")
        .eq("dealership_id", action.dealershipId)
        .maybeSingle();
      if (page?.published && page.slug) {
        const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.online";
        landingPageUrl = `${base}/p/${page.slug}`;
      }
    }

    return resolveAdDestination({
      productUrl: asked.product_url ?? null,
      productLabel: asked.product_label ?? null,
      externalWebsiteUrl: row.external_website_url,
      landingPageUrl,
      leadFormId: row.fb_lead_form_id,
      pageId: row.fb_page_id,
    });
  }

  async function draftFor(action: PublishActionRecord) {
    const { data } = await supabase
      .from("ad_creatives")
      .select("*")
      .eq("id", action.targetRef)
      .eq("dealership_id", action.dealershipId)
      .maybeSingle();
    return data ?? null;
  }

  return {
    id: "meta",
    supports: ["launch_ad_campaign"] as readonly ActionKey[],

    async isConnected(dealershipId: string) {
      const row = await connection(dealershipId);
      return Boolean(row && readMetaPageToken(row) && row.fb_ad_account_id && row.fb_page_id);
    },

    /**
     * Describe the campaign about to be created.
     *
     * Reads only. It touches Meta at most for the ad-account limits,
     * and only when the cached reading is stale — never to create
     * anything.
     */
    async preview(action: PublishActionRecord): Promise<PreviewResult> {
      const row = await connection(action.dealershipId);
      if (!row) return { ok: false, reason: "This business has no Meta connection." };

      const token = readMetaPageToken(row);
      if (!token || !row.fb_ad_account_id || !row.fb_page_id) {
        return { ok: false, reason: "Connect your Facebook Page before launching an ad." };
      }

      const draft = await draftFor(action);
      if (!draft) return { ok: false, reason: "That ad draft no longer exists — ask again and I'll build a new one." };
      if (!draft.plan_json || !draft.generated_image_url) {
        return { ok: false, reason: "That ad draft is incomplete — ask again and I'll build a new one." };
      }

      const limits = await getAdAccountLimits(supabase, action.dealershipId, { row, token });
      const account = isAccountUsable(limits.accountStatus);
      if (!account.usable) return { ok: false, reason: account.reason };

      const plan = draft.plan_json;
      const requested = Math.round((plan.daily_budget ?? 500) * 100);
      const budget = clampBudgetToMinimum(requested, limits.minDailyBudget);

      const warnings: string[] = [];
      if (budget.raised) {
        warnings.push(
          `Your ad account's minimum is ${describeMinimum(limits)}, so the daily budget was raised from ${formatMinorAmount(budget.from, limits.currency)} to ${formatMinorAmount(budget.minor, limits.currency)}.`
        );
      }
      // Said every time, not only when something is wrong. The whole
      // point of the inline card is that nobody has to go and check.
      warnings.push("Nothing spends yet — the campaign is created paused, and you activate it separately.");

      const dest = await destinationFor(action, row);
      if (!dest.ok) return { ok: false, reason: dest.reason };
      if (dest.destination.kind === "instant_form") {
        warnings.push("This ad collects enquiries on Facebook rather than sending people to a page — nobody can buy directly from it.");
      }

      const daily = formatMinorAmount(budget.minor, limits.currency);
      return {
        ok: true,
        preview: {
          summary: `Create a paused Meta campaign "${plan.headline}" at ${daily}/day.`,
          target: {
            title: plan.headline ?? "Ad campaign",
            variantTitle: plan.body ?? null,
            currentPrice: null,
            currency: limits.currency,
            currencyLabel: describeMinimum(limits),
            imageUrl: draft.generated_image_url,
            resolutionPath: "ai_generated_creative",
          },
          changes: [
            // `before` is null throughout: this creates rather than
            // edits, and the FieldChange type documents null as the
            // creating case.
            { field: "Campaign", before: null, after: plan.headline ?? "Untitled" },
            { field: "Ad copy", before: null, after: plan.body ?? "" },
            { field: "Daily budget", before: null, after: `${daily}/day` },
            { field: "Audience", before: null, after: plan.targeting_city ? `${plan.targeting_city} and nearby` : "Your usual audience" },
            // WHERE and WHAT-FOR, on the card, before anyone approves.
            // A lead-gen objective aimed at a product page is the
            // mismatch that made these worth showing.
            { field: "Sends people to", before: null, after: dest.destination.label },
            { field: "Optimising for", before: null, after: dest.destination.objectiveLabel },
            { field: "Status on Meta", before: null, after: "Paused — nothing runs until you activate it" },
          ],
          warnings,
        },
      };
    },

    /**
     * Create the campaign on Meta, paused.
     *
     * The staleness contract in PublishPlatform.execute is about a
     * platform moving under an approved EDIT. This creates, so there
     * are no before-values to re-verify. The equivalent hazard is
     * launching the same approved draft twice, which is guarded by the
     * draft's own status — and above that by the executor's claim,
     * which only lets one worker through.
     */
    async execute(action: PublishActionRecord): Promise<ExecuteResult> {
      const row = await connection(action.dealershipId);
      if (!row) return { ok: false, reason: "This business has no Meta connection." };

      const token = readMetaPageToken(row);
      if (!token || !row.fb_ad_account_id || !row.fb_page_id) {
        return { ok: false, reason: "The Facebook connection is missing or incomplete." };
      }

      const draft = await draftFor(action);
      if (!draft) return { ok: false, reason: "That ad draft no longer exists." };

      // Already launched. Not a failure of this execution so much as a
      // signal that the decision was already carried out.
      if (draft.status === "launched" && draft.meta_ad_id) {
        publishLog("meta.already_launched", { action: action.id, draft: draft.id, ad: draft.meta_ad_id });
        return { ok: true, platformResponse: { campaign_id: draft.meta_campaign_id, ad_id: draft.meta_ad_id, already: true } };
      }
      if (!draft.plan_json || !draft.generated_image_url) {
        return { ok: false, reason: "That ad draft is incomplete — nothing was created." };
      }

      // Re-checked at execution, not only at preview. An account can
      // be disabled between the two, and creating into a dead account
      // fails five Graph calls deep with an unhelpful error.
      const account = isAccountUsable(row.fb_account_status);
      if (!account.usable) return { ok: false, reason: account.reason };

      // Re-resolved rather than carried over from the preview: the
      // product could have been unpublished since. Same inputs, same
      // function, so an unchanged world gives the same answer.
      const dest = await destinationFor(action, row);
      if (!dest.ok) return { ok: false, reason: dest.reason };

      // The EXACT image the human approved, fetched back rather than
      // rebuilt.
      let finalBuffer: Buffer;
      try {
        const res = await fetch(draft.generated_image_url);
        if (!res.ok) throw new Error(`image fetch returned ${res.status}`);
        finalBuffer = Buffer.from(await res.arrayBuffer());
      } catch (err: any) {
        publishError("meta.image_unavailable", { action: action.id, detail: err?.message ?? String(err) });
        return { ok: false, reason: "Couldn't retrieve the approved image, so nothing was created." };
      }

      const { data: brandProfile } = await supabase
        .from("brand_profiles")
        .select("target_persona")
        .eq("dealership_id", action.dealershipId)
        .maybeSingle();

      try {
        const launched = await launchPausedCampaign({
          serviceClient: supabase,
          dealershipId: action.dealershipId,
          dealership: row,
          adAccount: row.fb_ad_account_id.startsWith("act_") ? row.fb_ad_account_id : `act_${row.fb_ad_account_id}`,
          pageAccessToken: token,
          pageId: row.fb_page_id,
          leadFormId: row.fb_lead_form_id,
          brandProfile,
          plan: draft.plan_json,
          draft,
          finalBuffer,
          publicUrl: draft.generated_image_url,
          destination: dest.destination,
        });

        publishLog("meta.launched", {
          action: action.id,
          campaign: launched.campaignId,
          adset: launched.adsetId,
          ad: launched.adId,
          budget_paise: launched.budget.minor,
        });

        return {
          ok: true,
          platformResponse: {
            campaign_id: launched.campaignId,
            adset_id: launched.adsetId,
            ad_id: launched.adId,
            creative_id: launched.creativeId,
            status: "PAUSED",
            daily_budget_minor: launched.budget.minor,
            targeting: launched.targetingSummary,
          },
        };
      } catch (err: any) {
        publishError("meta.launch_failed", { action: action.id, draft: draft.id, detail: err?.message ?? String(err) });
        await supabase.from("ad_creatives").update({ status: "failed", error_message: err?.message ?? String(err) }).eq("id", draft.id);
        return { ok: false, reason: err?.message ?? "Meta refused the campaign." };
      }
    },
  };
}
