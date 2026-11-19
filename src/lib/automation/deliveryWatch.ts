// The daily sweep for campaigns that say Active and reach nobody.
//
// A SUBSYSTEM, NOT A CRON ENTRY. Vercel Hobby allows exactly two and
// both are used, which is why cronGroups.ts exists at all. In `heavy`,
// because that file's own rule settles it: `signals` is "database-only
// and fast" and this makes live Graph reads.
//
// BEFORE daily_autopilot, like everything else in that group — the AI
// work at the end is what uses up the sixty seconds, and an alert the
// owner needed is not the thing to lose when it runs out.
//
// IT READS THE SNAPSHOTS daily_autopilot ALREADY WRITES, so there is no
// new table and no migration: analyticsAgent records impressions, spend
// and delivery_status per campaign per day, and that is everything the
// assessment needs. The live reads are only for DIAGNOSING the few
// campaigns that turn out to be silent — a business with nothing wrong
// makes no Graph calls at all.

import { assessSilence, diagnose, couldNotDiagnose, silenceAlert, type Snapshot } from "@/lib/ads/deliveryWatch";
import { readCampaignState } from "@/lib/ads/campaignStatus";
import { readCampaignBudget } from "@/lib/ads/campaignBudget";
import { accountHealthFor, LIMITS_SELECT } from "@/lib/ads/adAccountLimits";
import { adsTokenFor } from "@/lib/ads/metaToken";
import { META_PAGE_TOKEN_SELECT } from "@/lib/crypto/oauthSecrets";
import { emitNotification } from "@/lib/notifications/emit";
import { metaLog } from "@/lib/ads/metaLog";

/** Enough history to see a campaign's whole life without reading everything. */
export const LOOKBACK_DAYS = 120;

/**
 * A bound on the live work. A business with more silent campaigns than
 * this has one problem, not twelve, and the first few will say which.
 */
export const MAX_DIAGNOSED = 5;

export async function runDeliveryWatch(supabase: any, dealershipId: string): Promise<number> {
  const { data: campaigns } = await supabase
    .from("ad_creatives")
    .select("id, headline, meta_campaign_id, meta_adset_id, meta_ad_id, scheduled_start")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched");
  if (!campaigns?.length) return 0;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: history, error } = await supabase
    .from("campaign_performance_history")
    .select("ad_creative_id, snapshot_date, impressions, spend, delivery_status")
    .eq("dealership_id", dealershipId)
    .gte("snapshot_date", since);

  // A FAILED READ IS NOT AN EMPTY HISTORY. Treating it as one would
  // make every campaign look like it had never delivered, and alarm the
  // owner about all of them at once.
  if (error || !Array.isArray(history)) return 0;

  const byCampaign = new Map<string, Snapshot[]>();
  for (const row of history) {
    const list = byCampaign.get(row.ad_creative_id) ?? [];
    list.push(row as Snapshot);
    byCampaign.set(row.ad_creative_id, list);
  }

  const silent = campaigns
    .map((c: any) => ({ campaign: c, silence: assessSilence(byCampaign.get(c.id) ?? []) }))
    .filter((x: any) => x.silence.silent);

  if (silent.length === 0) return 0;

  // Only now is anything read from Meta, and only once per business.
  const { data: connection } = await supabase
    .from("dealerships")
    .select(`${META_PAGE_TOKEN_SELECT}, fb_page_id, fb_ad_account_id, ${LIMITS_SELECT}`)
    .eq("id", dealershipId)
    .maybeSingle();
  const token = (await adsTokenFor(supabase, dealershipId, connection)) ?? null;
  const account = token ? await accountHealthFor(supabase, dealershipId, { row: connection ?? undefined, token }) : null;

  let alerted = 0;
  for (const { campaign, silence } of silent.slice(0, MAX_DIAGNOSED)) {
    const objects = {
      campaignId: campaign.meta_campaign_id ?? null,
      adsetId: campaign.meta_adset_id ?? null,
      adId: campaign.meta_ad_id ?? null,
    };

    const state = token ? await readCampaignState(objects, token, account, dealershipId) : null;
    const budget = token ? await readCampaignBudget({ adsetId: objects.adsetId, campaignId: objects.campaignId }, token) : null;

    const cause =
      diagnose({
        account,
        connection: { pageId: connection?.fb_page_id ?? null, token },
        state,
        scheduledStart: campaign.scheduled_start ?? null,
        budget: budget
          ? { minor: budget.minor, minimumMinor: connection?.fb_min_daily_budget ?? null, currency: connection?.fb_currency ?? null }
          : null,
      }) ?? couldNotDiagnose(silence.hours);

    metaLog("delivery.silent", {
      dealership: dealershipId,
      campaign: campaign.id,
      hours: silence.hours,
      cause: cause.key,
    });

    const alert = silenceAlert(campaign.headline ?? "This campaign", silence as any, cause);
    await emitNotification(supabase, {
      dealershipId,
      kind: alert.kind,
      title: alert.title,
      body: alert.body,
      href: alert.href,
      // Scoped to the campaign as well as the cause, so two broken
      // campaigns are two alerts and the same one is never repeated.
      dedupeKey: `${alert.dedupeKey}:${campaign.id}`,
    });
    alerted++;
  }

  return alerted;
}
