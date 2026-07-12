// ------------------------------------------------------------------
// Autopilot Agent — daily prep, never auto-execute
// ------------------------------------------------------------------
// Runs once a day (via Vercel Cron) across every dealership. It never
// sends a message, spends money, or publishes anything by itself —
// per how Ovaiz wants this configured, EVERYTHING still needs a human
// click. What it does do automatically, every morning, without
// anyone asking:
//   1. Refreshes the Opportunity Feed (syncOpportunities)
//   2. Pre-writes a WhatsApp follow-up draft for every stuck lead
//      that doesn't already have a fresh one, so by the time someone
//      opens the Call Queue, the message is already written — review
//      and send, not "generate then review then send".
//
// This is the "prep is automatic, action is still yours" model.
// ------------------------------------------------------------------

import { syncOpportunities } from "./opportunityAgent";
import { generateFollowUpMessage } from "./contentAgent";
import { analyzeCampaigns } from "./optimizationAgent";
import { setCampaignStatus } from "./campaignEditAgent";
import { snapshotCampaignPerformance } from "./analyticsAgent";

const STALE_DRAFT_HOURS = 24; // regenerate if the draft is older than this

async function draftStuckLeadFollowUps(supabase: any, dealershipId: string): Promise<number> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const staleThreshold = new Date(Date.now() - STALE_DRAFT_HOURS * 60 * 60 * 1000).toISOString();

  const { data: stuckLeads } = await supabase
    .from("leads")
    .select("id, name, vehicle, budget, lead_temperature, status, draft_followup_generated_at")
    .eq("dealership_id", dealershipId)
    .in("status", ["new", "ready_to_call"])
    .lt("created_at", twoDaysAgo);

  if (!stuckLeads || stuckLeads.length === 0) return 0;

  const needsDraft = stuckLeads.filter(
    (l: any) => !l.draft_followup_generated_at || l.draft_followup_generated_at < staleThreshold
  );
  if (needsDraft.length === 0) return 0;

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars, preferred_language")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  let drafted = 0;
  for (const lead of needsDraft) {
    try {
      const message = await generateFollowUpMessage(lead, brandProfile, "whatsapp");
      await supabase
        .from("leads")
        .update({ draft_followup_message: message.message, draft_followup_generated_at: new Date().toISOString() })
        .eq("id", lead.id);
      drafted++;
    } catch (err: any) {
      console.error("[autopilot] draft failed for lead", lead.id, err.message);
    }
  }
  return drafted;
}

// ------------------------------------------------------------------
// Opt-in only: Permission Tiers (Block 7). Nothing here runs unless
// the dealer explicitly turned it on in Settings -> Automation.
// Every action taken is logged as an already-'approved' entry with a
// clear reason, so it's fully visible and explainable after the
// fact — never a silent action.
// ------------------------------------------------------------------
async function applyAutoPause(supabase: any, dealershipId: string): Promise<number> {
  const { data: dealership } = await supabase
    .from("dealerships").select("auto_pause_low_performers").eq("id", dealershipId).single();
  if (!dealership?.auto_pause_low_performers) return 0;

  const result = await analyzeCampaigns(supabase, dealershipId);
  const toPause = result.recommendations.filter((r) => r.action === "pause");
  if (toPause.length === 0) return 0;

  const { data: campaigns } = await supabase
    .from("ad_creatives")
    .select("id, headline, meta_ad_id, meta_status")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched");

  let pausedCount = 0;
  for (const rec of toPause) {
    const campaign = (campaigns ?? []).find((c: any) => c.id === rec.campaign_id && c.meta_status === "ACTIVE");
    if (!campaign) continue;

    const outcome = await setCampaignStatus(supabase, dealershipId, campaign, "PAUSED");
    if (outcome.success) {
      pausedCount++;
      // Transparent log — always explainable, never silent.
      await supabase.from("pending_approvals").insert({
        dealership_id: dealershipId,
        requested_by_agent: "autopilot_auto_pause",
        action_type: "auto_paused_campaign",
        action_details: { campaign_id: campaign.id, headline: campaign.headline, reason: rec.reason },
        status: "approved",
        reviewed_at: new Date().toISOString(),
      });
    }
  }
  return pausedCount;
}

export async function runDailyAutopilot(supabase: any, dealershipId: string): Promise<{ drafted: number; auto_paused: number; snapshotted: number }> {
  await syncOpportunities(supabase, dealershipId);
  const drafted = await draftStuckLeadFollowUps(supabase, dealershipId);
  const auto_paused = await applyAutoPause(supabase, dealershipId);
  const snapshotted = await snapshotCampaignPerformance(supabase, dealershipId);
  return { drafted, auto_paused, snapshotted };
}
