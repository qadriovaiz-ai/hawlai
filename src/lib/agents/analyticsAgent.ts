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

export async function getCampaignPerformance(
  supabase: any,
  dealershipId: string
): Promise<{ campaigns: CampaignPerformance[]; totals: { spend: number; leads: number; cost_per_lead: number | null } }> {
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
