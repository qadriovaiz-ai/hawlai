// ------------------------------------------------------------------
// Analytics Agent — Phase 1 basic version
// ------------------------------------------------------------------
// Combines two data sources per launched campaign:
//  1. Meta Insights API — spend, impressions, clicks (Meta's own numbers)
//  2. Our own leads table — how many leads that campaign actually produced
//     (via the meta_campaign_id captured on each lead by the webhook)
//
// From these two, it computes cost-per-lead, which per earlier
// conversations is the single number dealers care about most.
// ------------------------------------------------------------------

import type { Loaded } from "@/lib/dataState";

const GRAPH_VERSION = "v23.0";

export interface CampaignPerformance {
  id: string; // ad_creatives row id
  headline: string;
  meta_campaign_id: string;
  meta_status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  cost_per_lead: number | null;
  revenue: number;
  conversions: number;
  roas: number | null;
}

async function fetchInsights(campaignId: string, token: string) {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}/insights?fields=spend,impressions,clicks,ctr&date_preset=maximum&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error("[analytics-agent] insights error for", campaignId, data.error?.message);
      return null;
    }
    // Insights returns an array (usually one row for the whole date_preset range)
    return data.data?.[0] ?? null;
  } catch (err: any) {
    console.error("[analytics-agent] fetchInsights failed:", campaignId, err.message);
    return null;
  }
}

export interface CampaignPerformanceResult {
  campaigns: CampaignPerformance[];
  totals: { spend: number; leads: number; cost_per_lead: number | null };
}

/**
 * Campaign performance, with the reason for an empty result preserved.
 *
 * getCampaignPerformance() below collapses three genuinely different
 * situations into the same `{ campaigns: [], spend: 0 }`:
 *
 *   1. no launched campaigns      -> "you haven't launched anything"
 *   2. no Meta token              -> "we can't see your ad account"
 *   3. the ad_creatives query failed -> "we couldn't load this"
 *
 * Only the first means zero. The other two are indistinguishable from
 * it at every call site, which is how a dealer with live campaigns and
 * an expired token ends up being told their campaigns produced nothing.
 *
 * This is a SIBLING rather than a change to the existing function's
 * signature, on purpose: getCampaignPerformance has 13 call sites
 * across 11 files and this codebase has no automated tests, so
 * rewriting all of them at once would be a large unverifiable change.
 * The user-visible call sites move here; the rest are listed as
 * follow-up in the commit so the two don't quietly become permanent.
 */
export async function getCampaignPerformanceState(
  supabase: any,
  dealershipId: string
): Promise<Loaded<CampaignPerformanceResult>> {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_access_token")
    .eq("id", dealershipId)
    .single();

  const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;

  // Checked BEFORE the campaign query. Without a token the campaign
  // list is irrelevant — we could not read performance for it either
  // way, and reporting "no campaigns" would be the wrong reason.
  if (!token) return { state: "not_connected", channel: "meta_ads" };

  const { data: launchedAds, error } = await supabase
    .from("ad_creatives")
    .select("id, headline, meta_campaign_id, meta_status")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched")
    .not("meta_campaign_id", "is", null);

  if (error) return { state: "error", message: "Couldn't load your campaigns." };

  if (!launchedAds || launchedAds.length === 0) {
    return {
      state: "no_data",
      reason: "No campaigns launched yet — this fills in once you launch your first ad.",
    };
  }

  // Past the guards the underlying implementation is identical, so
  // there is one code path fetching insights rather than two that
  // could drift.
  return { state: "ok", value: await getCampaignPerformance(supabase, dealershipId) };
}

/**
 * DEPRECATED. Prefer getCampaignPerformanceState() above.
 *
 * Returns `{ campaigns: [], spend: 0 }` for three different reasons —
 * no campaigns launched, no Meta token, or a failed query — with no
 * way for a caller to tell them apart.
 *
 * ONE CALLER REMAINS, and it is genuinely safe:
 *   src/lib/agents/autopilotAgent.ts:118 — verified: the value is used
 *   only at lines 119-120, to build the comparison set and per-campaign
 *   figures passed to explainCampaign(). It runs AFTER the pause
 *   decision, which comes from optimizationAgent's own guarded
 *   analysis. A false zero here produces a weaker explanation, never a
 *   wrong action.
 *
 * The overview page was ALSO annotated safe here and was not. Its
 * lifetime-revenue sum ran over performance.campaigns, which is empty
 * when the token is missing, so a business with real attributed
 * revenue showed Rs 0. Fixed; the annotation had been wrong.
 *
 * Delete this function once autopilotAgent moves across.
 */
export async function getCampaignPerformance(
  supabase: any,
  dealershipId: string
): Promise<CampaignPerformanceResult> {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_access_token")
    .eq("id", dealershipId)
    .single();

  const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;

  const { data: launchedAds } = await supabase
    .from("ad_creatives")
    .select("id, headline, meta_campaign_id, meta_status")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched")
    .not("meta_campaign_id", "is", null);

  if (!launchedAds || launchedAds.length === 0 || !token) {
    return { campaigns: [], totals: { spend: 0, leads: 0, cost_per_lead: null } };
  }

  // Lead counts per campaign — one query, grouped client-side.
  const { data: leads } = await supabase
    .from("leads")
    .select("meta_campaign_id")
    .eq("dealership_id", dealershipId)
    .not("meta_campaign_id", "is", null);

  const leadCountByCampaign: Record<string, number> = {};
  for (const lead of leads ?? []) {
    const cid = lead.meta_campaign_id;
    leadCountByCampaign[cid] = (leadCountByCampaign[cid] ?? 0) + 1;
  }

  // Revenue per campaign — which leads actually converted to a sale
  // (deal_value set on the CRM side), grouped by originating campaign.
  const { data: convertedLeads } = await supabase
    .from("leads")
    .select("meta_campaign_id, deal_value")
    .eq("dealership_id", dealershipId)
    .eq("status", "converted")
    .not("meta_campaign_id", "is", null)
    .not("deal_value", "is", null);

  const revenueByCampaign: Record<string, { revenue: number; conversions: number }> = {};
  for (const lead of convertedLeads ?? []) {
    const cid = lead.meta_campaign_id;
    if (!revenueByCampaign[cid]) revenueByCampaign[cid] = { revenue: 0, conversions: 0 };
    revenueByCampaign[cid].revenue += Number(lead.deal_value ?? 0);
    revenueByCampaign[cid].conversions += 1;
  }

  const campaigns: CampaignPerformance[] = await Promise.all(
    launchedAds.map(async (ad: any) => {
      const insights = await fetchInsights(ad.meta_campaign_id, token);
      const spend = insights?.spend ? Number(insights.spend) : 0;
      const impressions = insights?.impressions ? Number(insights.impressions) : 0;
      const clicks = insights?.clicks ? Number(insights.clicks) : 0;
      const ctr = insights?.ctr ? Number(insights.ctr) : 0;
      const leadCount = leadCountByCampaign[ad.meta_campaign_id] ?? 0;

      return {
        id: ad.id,
        headline: ad.headline,
        meta_campaign_id: ad.meta_campaign_id,
        meta_status: ad.meta_status ?? "PAUSED",
        spend,
        impressions,
        clicks,
        ctr,
        leads: leadCount,
        cost_per_lead: leadCount > 0 ? spend / leadCount : null,
        revenue: revenueByCampaign[ad.meta_campaign_id]?.revenue ?? 0,
        conversions: revenueByCampaign[ad.meta_campaign_id]?.conversions ?? 0,
        roas: spend > 0 && revenueByCampaign[ad.meta_campaign_id]?.revenue ? revenueByCampaign[ad.meta_campaign_id].revenue / spend : null,
      };
    })
  );

  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
  const totalLeads = campaigns.reduce((sum, c) => sum + c.leads, 0);

  return {
    campaigns,
    totals: {
      spend: totalSpend,
      leads: totalLeads,
      cost_per_lead: totalLeads > 0 ? totalSpend / totalLeads : null,
    },
  };
}

// ------------------------------------------------------------------
// Permanent snapshot — run once a day (via Autopilot cron) so
// performance history survives even if Meta access is ever lost,
// an ad account changes, or a campaign gets deleted on Meta's side.
// getCampaignPerformance() above always reflects live Meta data;
// this is the durable copy of that same data, one row per campaign
// per day.
// ------------------------------------------------------------------
export async function snapshotCampaignPerformance(supabase: any, dealershipId: string): Promise<number> {
  const performance = await getCampaignPerformance(supabase, dealershipId);
  if (performance.campaigns.length === 0) return 0;

  const rows = performance.campaigns.map((c) => ({
    dealership_id: dealershipId,
    ad_creative_id: c.id,
    snapshot_date: new Date().toISOString().slice(0, 10),
    headline: c.headline,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    leads: c.leads,
    cost_per_lead: c.cost_per_lead,
    revenue: c.revenue,
    conversions: c.conversions,
    roas: c.roas,
  }));

  const { error } = await supabase
    .from("campaign_performance_history")
    .upsert(rows, { onConflict: "ad_creative_id,snapshot_date" });

  if (error) {
    console.error("[analytics-agent] snapshotCampaignPerformance error:", error.message);
    return 0;
  }
  return rows.length;
}
