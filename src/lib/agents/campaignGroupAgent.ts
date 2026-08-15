// Cross-channel orchestration, Phase A (master audit deferred Item 3,
// see migration 114). A campaign_group is just a named folder over
// existing assets from different channels — it doesn't create or
// schedule anything itself. The value is the rollup: one performance
// view spanning ad spend, workflow sends, and social posts for the
// same real-world initiative (e.g. "Diwali Sale 2026").

export type AssetType = "ad_creative" | "workflow" | "social_post";

const ASSET_TABLE: Record<AssetType, string> = {
  ad_creative: "ad_creatives",
  workflow: "workflows",
  social_post: "social_post_queue",
};

export async function getAvailableAssets(supabase: any, dealershipId: string) {
  const [{ data: adCreatives }, { data: workflows }, { data: socialPosts }] = await Promise.all([
    supabase.from("ad_creatives").select("id, headline, status, created_at").eq("dealership_id", dealershipId).eq("status", "launched").order("created_at", { ascending: false }),
    supabase.from("workflows").select("id, name, trigger_type, enabled").eq("dealership_id", dealershipId).order("created_at", { ascending: false }),
    supabase.from("social_post_queue").select("id, caption, status, scheduled_for").eq("dealership_id", dealershipId).order("scheduled_for", { ascending: false }),
  ]);
  return { adCreatives: adCreatives ?? [], workflows: workflows ?? [], socialPosts: socialPosts ?? [] };
}

export async function getCampaignGroups(supabase: any, dealershipId: string) {
  const { data: groups } = await supabase
    .from("campaign_groups")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  if (!groups || groups.length === 0) return [];

  const { data: allAssets } = await supabase
    .from("campaign_group_assets")
    .select("*")
    .in("campaign_group_id", groups.map((g: { id: string }) => g.id));

  const results = [];
  for (const group of groups) {
    const assets = (allAssets ?? []).filter((a: { campaign_group_id: string }) => a.campaign_group_id === group.id);
    const adCreativeIds = assets.filter((a: { asset_type: AssetType }) => a.asset_type === "ad_creative").map((a: { asset_id: string }) => a.asset_id);
    const workflowIds = assets.filter((a: { asset_type: AssetType }) => a.asset_type === "workflow").map((a: { asset_id: string }) => a.asset_id);
    const socialPostIds = assets.filter((a: { asset_type: AssetType }) => a.asset_type === "social_post").map((a: { asset_id: string }) => a.asset_id);

    const [adRollup, workflowSends, postedCount] = await Promise.all([
      adCreativeIds.length > 0
        ? supabase.from("campaign_performance_history").select("spend, clicks, leads").in("ad_creative_id", adCreativeIds)
        : Promise.resolve({ data: [] }),
      workflowIds.length > 0
        ? supabase.from("workflow_step_runs").select("id", { count: "exact", head: true }).in("workflow_id", workflowIds).eq("success", true)
        : Promise.resolve({ count: 0 }),
      socialPostIds.length > 0
        ? supabase.from("social_post_queue").select("id", { count: "exact", head: true }).in("id", socialPostIds).eq("status", "posted")
        : Promise.resolve({ count: 0 }),
    ]);

    const rollup = (adRollup.data ?? []).reduce(
      (acc: { spend: number; clicks: number; leads: number }, row: { spend: number; clicks: number; leads: number }) => ({
        spend: acc.spend + (row.spend ?? 0),
        clicks: acc.clicks + (row.clicks ?? 0),
        leads: acc.leads + (row.leads ?? 0),
      }),
      { spend: 0, clicks: 0, leads: 0 }
    );

    results.push({
      ...group,
      assets,
      performance: {
        ...rollup,
        workflowSends: workflowSends.count ?? 0,
        postedSocialCount: postedCount.count ?? 0,
        adCreativeCount: adCreativeIds.length,
        workflowCount: workflowIds.length,
        socialPostCount: socialPostIds.length,
      },
    });
  }
  return results;
}

export async function createCampaignGroup(supabase: any, dealershipId: string, name: string) {
  return supabase.from("campaign_groups").insert({ dealership_id: dealershipId, name }).select().single();
}

export async function updateCampaignGroup(supabase: any, dealershipId: string, groupId: string, update: { name?: string; status?: "active" | "archived" }) {
  return supabase.from("campaign_groups").update(update).eq("id", groupId).eq("dealership_id", dealershipId);
}

export async function deleteCampaignGroup(supabase: any, dealershipId: string, groupId: string) {
  return supabase.from("campaign_groups").delete().eq("id", groupId).eq("dealership_id", dealershipId);
}

// Validates the asset actually belongs to this dealership before
// attaching it — asset_id has no FK (it's polymorphic across 3
// tables), so this app-side check is the only thing standing between
// a dealer and attaching someone else's asset by guessing an id.
export async function attachAsset(supabase: any, dealershipId: string, groupId: string, assetType: AssetType, assetId: string) {
  const table = ASSET_TABLE[assetType];
  const { data: owned } = await supabase.from(table).select("id").eq("id", assetId).eq("dealership_id", dealershipId).maybeSingle();
  if (!owned) return { error: "Asset not found" };

  const { data: group } = await supabase.from("campaign_groups").select("id").eq("id", groupId).eq("dealership_id", dealershipId).maybeSingle();
  if (!group) return { error: "Campaign group not found" };

  return supabase.from("campaign_group_assets").upsert(
    { campaign_group_id: groupId, dealership_id: dealershipId, asset_type: assetType, asset_id: assetId },
    { onConflict: "campaign_group_id,asset_type,asset_id", ignoreDuplicates: true }
  );
}

export async function detachAsset(supabase: any, dealershipId: string, groupId: string, assetType: AssetType, assetId: string) {
  return supabase
    .from("campaign_group_assets")
    .delete()
    .eq("campaign_group_id", groupId)
    .eq("dealership_id", dealershipId)
    .eq("asset_type", assetType)
    .eq("asset_id", assetId);
}
