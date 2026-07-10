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

export async function runDailyAutopilot(supabase: any, dealershipId: string): Promise<{ drafted: number }> {
  await syncOpportunities(supabase, dealershipId);
  const drafted = await draftStuckLeadFollowUps(supabase, dealershipId);
  return { drafted };
}
