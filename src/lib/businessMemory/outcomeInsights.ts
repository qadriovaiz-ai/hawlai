// ------------------------------------------------------------------
// Outcome/learning feedback loop — master audit Part B1.
// ------------------------------------------------------------------
// business_memory has always been writable manually or by the LLM
// mid-chat (remember_insight), but nothing ever wrote to it
// automatically from a real, resolved outcome — despite outcome data
// (lead status, call results, campaign performance) existing all over
// the schema already. These three functions are called from the
// three places an outcome already concretely resolves in this
// codebase (lead status change, call completion, campaign auto-pause)
// rather than building a new universal action->outcome tracking
// system. Every insert uses source: "auto_analytics" (an enum value
// business_memory has reserved since migration 089 but never used)
// and the related_entity_type/id columns (migration 102) so future
// code can filter/query by entity without another migration.
//
// Best-effort by design: an insight is a nice-to-have for future
// generations, never a blocking dependency, so every function
// swallows its own errors rather than failing the caller's real work
// (updating a lead, logging a call, pausing a campaign).
// ------------------------------------------------------------------

export async function recordLeadOutcomeInsight(
  supabase: any,
  lead: {
    id: string;
    dealership_id: string;
    name: string;
    status: string;
    source?: string | null;
    meta_campaign_id?: string | null;
    qualification_reason?: string | null;
    deal_value?: number | null;
  }
) {
  if (lead.status !== "converted" && lead.status !== "not_interested") return;
  try {
    const parts: string[] = [];
    if (lead.status === "converted") {
      parts.push(`Lead "${lead.name}" converted`);
      if (lead.deal_value) parts.push(`worth ₹${lead.deal_value}`);
    } else {
      parts.push(`Lead "${lead.name}" was marked not interested`);
    }
    if (lead.source) parts.push(`(source: ${lead.source.replaceAll("_", " ")})`);
    if (lead.qualification_reason) parts.push(`— ${lead.qualification_reason}`);

    await supabase.from("business_memory").insert({
      dealership_id: lead.dealership_id,
      category: lead.meta_campaign_id ? "campaign_performance" : "audience_insight",
      insight: parts.join(" "),
      source: "auto_analytics",
      related_entity_type: "lead",
      related_entity_id: lead.id,
    });
  } catch {
    // Best-effort — never break the actual lead-status update over this.
  }
}

export async function recordCallOutcomeInsight(
  supabase: any,
  call: { id: string; dealershipId: string; leadName: string; temperature: string; reason: string; urgency?: string }
) {
  // Only worth remembering when the call produced a real signal —
  // not every routine "called" status update.
  if (call.temperature !== "hot" && call.temperature !== "cold") return;
  try {
    const urgencyNote = call.urgency === "high" ? " — flagged as urgent" : "";
    const insight = call.temperature === "hot"
      ? `Call with "${call.leadName}" went well — ${call.reason}${urgencyNote}`
      : `Call with "${call.leadName}" didn't land — ${call.reason}`;
    await supabase.from("business_memory").insert({
      dealership_id: call.dealershipId,
      category: "audience_insight",
      insight,
      source: "auto_analytics",
      related_entity_type: "call",
      related_entity_id: call.id,
    });
  } catch {
    // Best-effort.
  }
}

export async function recordCampaignPauseInsight(
  supabase: any,
  dealershipId: string,
  campaign: { id: string; headline: string; reason: string }
) {
  try {
    await supabase.from("business_memory").insert({
      dealership_id: dealershipId,
      category: "campaign_performance",
      insight: `Auto-paused campaign "${campaign.headline}" — ${campaign.reason}`,
      source: "auto_analytics",
      related_entity_type: "ad_creative",
      related_entity_id: campaign.id,
    });
  } catch {
    // Best-effort.
  }
}
