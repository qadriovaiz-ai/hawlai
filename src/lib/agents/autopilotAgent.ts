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
import { getLeadMemory } from "@/lib/businessMemory/getLeadMemory";
import { analyzeCampaigns } from "./optimizationAgent";
import { setCampaignStatus } from "./campaignEditAgent";
import { snapshotCampaignPerformance, getCampaignPerformanceState, type CampaignPerformanceResult } from "./analyticsAgent";
import { recordCampaignPauseInsight } from "@/lib/businessMemory/outcomeInsights";
import { emitNotification } from "@/lib/notifications/emit";
import { explainCampaign, getComparisonCampaigns } from "./reportingAgent";
import { generateAdPlan } from "../adEngine";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

const STALE_DRAFT_HOURS = 24; // regenerate if the draft is older than this
const VARIANT_GROUP_LABELS = ["A", "B", "C", "D", "E"]; // same cap as variant-group/route.ts

async function draftStuckLeadFollowUps(supabase: any, dealershipId: string): Promise<number> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const staleThreshold = new Date(Date.now() - STALE_DRAFT_HOURS * 60 * 60 * 1000).toISOString();

  const { data: stuckLeads } = await supabase
    .from("leads")
    .select("id, name, vehicle, budget, lead_temperature, status, qualification_reason, draft_followup_generated_at")
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
      // P3 — real cross-interaction memory (getLeadMemory, P1 4a),
      // same addition as the manual generate-message route.
      const pastInsights = await getLeadMemory(supabase, dealershipId, lead.id);
      const message = await generateFollowUpMessage(lead, brandProfile, "whatsapp", undefined, undefined, pastInsights);
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
    .from("dealerships").select("auto_pause_low_performers, business_category").eq("id", dealershipId).single();
  if (!dealership?.auto_pause_low_performers) return 0;

  const result = await analyzeCampaigns(supabase, dealershipId);
  const toPause = result.recommendations.filter((r) => r.action === "pause");
  if (toPause.length === 0) return 0;

  const { data: campaigns } = await supabase
    .from("ad_creatives")
    .select("id, headline, body_copy, meta_ad_id, meta_status, daily_budget, targeting_city, creative_score, mode, background_style, scheduled_start, variant_group_id")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched");

  let pausedCount = 0;
  // Fetched at most once per cron run, not once per paused campaign —
  // Meta's Insights API is a live call, no need to hit it repeatedly
  // in the same pass.
  let performanceCache: CampaignPerformanceResult | null = null;

  for (const rec of toPause) {
    const campaign = (campaigns ?? []).find((c: any) => c.id === rec.campaign_id && c.meta_status === "ACTIVE");
    if (!campaign) continue;

    const outcome = await setCampaignStatus(supabase, dealershipId, campaign, "PAUSED");
    if (outcome.success) {
      pausedCount++;

      // AI-Intelligence Pillar 1 — causal reasoning. A comparative
      // explanation (why THIS one underperformed its siblings) is more
      // useful to remember than optimizationAgent's flat per-campaign
      // reason, so it's what reaches the business owner and gets
      // written into business_memory. rec.reason stays untouched as
      // the internal audit trail of what triggered the pause action.
      // Used ONLY to enrich the explanation — the pause decision was
      // already made by analyzeCampaigns above, which has its own
      // not-connected handling. So when performance is unreadable here
      // the campaign still pauses; it just gets the plain reason
      // instead of a comparative one. rec.reason is never a false zero.
      if (!performanceCache) {
        const state = await getCampaignPerformanceState(supabase, dealershipId);
        performanceCache = state.state === "ok" ? state.value : { campaigns: [], totals: { spend: 0, leads: 0, cost_per_lead: null } };
      }
      const comparisons = await getComparisonCampaigns(supabase, dealershipId, campaign, performanceCache.campaigns);
      const thisPerf = performanceCache.campaigns.find((p) => p.id === campaign.id) ?? null;
      const explainedReason = comparisons.length > 0
        ? await explainCampaign(campaign, thisPerf, dealership.business_category ?? "car dealership", { supabase, dealershipId }, comparisons)
        : rec.reason;

      // Transparent log — always explainable, never silent.
      await supabase.from("pending_approvals").insert({
        dealership_id: dealershipId,
        requested_by_agent: "autopilot_auto_pause",
        action_type: "auto_paused_campaign",
        action_details: { campaign_id: campaign.id, headline: campaign.headline, reason: rec.reason },
        status: "approved",
        reviewed_at: new Date().toISOString(),
      });
      // P0 30b — real spend stopped with zero human in the loop; this
      // is the clearest "highest-value" cron event to audit (vs. the
      // cron heartbeat itself, already covered by automation_run_log).
      await logAuditEvent(supabase, {
        dealershipId,
        actor: "cron:daily_autopilot",
        eventType: "campaign_auto_paused",
        resourceType: "ad_creative",
        resourceId: campaign.id,
        summary: `Auto-paused "${campaign.headline}" — ${rec.reason}`,
        details: { reason: rec.reason, explained_reason: explainedReason },
      });
      await recordCampaignPauseInsight(supabase, dealershipId, { id: campaign.id, headline: campaign.headline, reason: explainedReason });
      // Money was just stopped without a human in the loop — that
      // belongs in the notification centre, not only in the approvals
      // log where it had to be gone looking for.
      await emitNotification(supabase, {
        dealershipId,
        kind: "campaign_auto_paused",
        title: `Auto-paused "${campaign.headline}"`,
        body: explainedReason,
        href: "/dashboard/ads/campaigns",
        dedupeKey: `auto_pause:${campaign.id}`,
      });

      // AI-Intelligence Pillar 2 — auto-iteration. Draft-only: this
      // never launches anything or spends money by itself.
      await maybeGenerateVariantOnPause(supabase, dealershipId, dealership.business_category ?? "car dealership", campaign);
    }
  }
  return pausedCount;
}

// ------------------------------------------------------------------
// AI-Intelligence Pillar 2 — auto-iteration on creative A/B tests.
// Fires only when auto_generate_variant_on_pause is explicitly opted
// into (separate from auto_pause_low_performers) AND the pause just
// applied left exactly one active member of the variant group
// standing — that's the clearest "the test has a winner" signal
// available without a dedicated declare-winner flow. Only ever
// creates a draft (status: 'draft', same as a manually-started ad
// preview) — never launches it, never spends money.
// ------------------------------------------------------------------
async function maybeGenerateVariantOnPause(
  supabase: any,
  dealershipId: string,
  businessCategory: string,
  pausedCampaign: { id: string; variant_group_id?: string | null }
) {
  if (!pausedCampaign.variant_group_id) return;

  const { data: dealership } = await supabase
    .from("dealerships").select("auto_generate_variant_on_pause").eq("id", dealershipId).single();
  if (!dealership?.auto_generate_variant_on_pause) return;

  const { data: members } = await supabase
    .from("ad_creatives")
    .select("id, variant_label, meta_status, headline, body_copy, prompt, targeting_city, daily_budget")
    .eq("variant_group_id", pausedCampaign.variant_group_id);
  if (!members || members.length >= VARIANT_GROUP_LABELS.length) return; // cap reached

  const activeMembers = members.filter((m: any) => m.meta_status === "ACTIVE");
  if (activeMembers.length !== 1) return; // no clear winner yet, or test still has multiple live members

  const winner = activeMembers[0];
  const loser = members.find((m: any) => m.id === pausedCampaign.id);
  const usedLabels = new Set(members.map((m: any) => m.variant_label).filter(Boolean));
  const nextLabel = VARIANT_GROUP_LABELS.find((l) => !usedLabels.has(l));
  if (!nextLabel) return;

  try {
    const { data: brandProfile } = await supabase
      .from("brand_profiles")
      .select("tone_of_voice, target_persona, messaging_pillars, preferred_language")
      .eq("dealership_id", dealershipId)
      .maybeSingle();

    const variantPrompt = `This ad is winning an A/B test: "${winner.headline}" — ${winner.body_copy ?? ""}. This one lost: "${loser?.headline ?? "an earlier variant"}" — ${loser?.body_copy ?? ""}. Targeting ${winner.targeting_city ?? "the same city"}, budget ₹${winner.daily_budget ?? 500}/day. Create a genuinely different new creative angle (different headline hook and/or background style) to test as variant ${nextLabel} against the winner — it needs to be meaningfully different from both of the above, not a small rewording of either.`;

    const plan = await generateAdPlan(variantPrompt, brandProfile, businessCategory, { supabase, dealershipId });

    const { data: newDraft, error } = await supabase.from("ad_creatives").insert({
      dealership_id: dealershipId,
      mode: "ai_generate",
      prompt: variantPrompt,
      background_style: plan.background_style,
      headline: plan.headline,
      body_copy: plan.body,
      creative_score: plan.confidence_score ?? null,
      score_reasoning: plan.score_reasoning ?? null,
      plan_json: plan,
      status: "draft",
      variant_group_id: pausedCampaign.variant_group_id,
      variant_label: nextLabel,
    }).select("id, headline").single();
    if (error || !newDraft) return;

    await emitNotification(supabase, {
      dealershipId,
      kind: "variant_draft_generated",
      title: `New ad variant ready to review: "${newDraft.headline}"`,
      body: `Generated as variant ${nextLabel} to test against your current winner — review and launch it from Campaigns whenever you're ready.`,
      href: "/dashboard/ads/campaigns",
      dedupeKey: `variant_draft:${newDraft.id}`,
    });
  } catch (err: any) {
    console.error("[autopilot] maybeGenerateVariantOnPause failed:", err.message);
  }
}

export async function runDailyAutopilot(supabase: any, dealershipId: string): Promise<{ drafted: number; auto_paused: number; snapshotted: number }> {
  await syncOpportunities(supabase, dealershipId);
  const drafted = await draftStuckLeadFollowUps(supabase, dealershipId);
  const auto_paused = await applyAutoPause(supabase, dealershipId);
  const snapshotted = await snapshotCampaignPerformance(supabase, dealershipId);
  return { drafted, auto_paused, snapshotted };
}
