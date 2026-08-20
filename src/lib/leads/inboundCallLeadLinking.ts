// ------------------------------------------------------------------
// Inbound Call -> Lead Linking — P2 27a-iv (Cross-Channel Identity)
// ------------------------------------------------------------------
// Resolves (or creates) the lead + calls row for an INBOUND AI call.
// Outbound calls already get a real calls row at trigger time
// (triggerVapiCall) with a known lead_id — inbound calls previously
// created nothing at all: no calls row, no lead lookup, the
// end-of-call-report handler just returned early.
//
// NOTE: this is currently dormant, UNTESTED-IN-PRODUCTION
// infrastructure — no dedicated Vapi phone numbers are provisioned
// yet (DLT registration pending, same as handleAssistantRequest's own
// existing comment notes), so this code path cannot receive real
// inbound calls or be live-tested until that's done. Built now so the
// feature is ready the moment DLT approval lands, per explicit
// instruction — not verified against a real inbound call.
//
// Same confident/doubtful phone-match philosophy as 27a-iii's DM
// linking, adapted for calls.lead_id's NOT NULL constraint: a call
// row must reference exactly one lead, so even the ambiguous case
// picks the most-recently-created match rather than leaving it unset
// — but still flags it for review so it's visibly correctable.
// ------------------------------------------------------------------

import { emitNotification } from "../notifications/emit";

function normalizePhoneSuffix(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export async function resolveInboundCallLead(
  supabase: any,
  dealershipId: string,
  callerPhone: string | null
): Promise<{ id: string; name: string; dealership_id: string }> {
  if (callerPhone) {
    const suffix = normalizePhoneSuffix(callerPhone);
    const { data: candidates } = await supabase
      .from("leads")
      .select("id, name, dealership_id, created_at")
      .eq("dealership_id", dealershipId)
      .ilike("phone", `%${suffix}`)
      .is("merged_into_lead_id", null)
      .order("created_at", { ascending: false });

    if (candidates && candidates.length === 1) return candidates[0];

    if (candidates && candidates.length > 1) {
      // Ambiguous — calls.lead_id can't be left unset, so the most
      // recent match is used, but flagged so it's visibly correctable
      // rather than silently guessed.
      const picked = candidates[0];
      await emitNotification(supabase, {
        dealershipId,
        kind: "lead_merge_needs_review",
        title: `Inbound call matched ambiguously: "${picked.name}"`,
        body: `An inbound call from ${callerPhone} matched ${candidates.length} existing leads — attributed to the most recent one, please verify.`,
        href: `/dashboard/leads/${picked.id}`,
        dedupeKey: `inbound_call_ambiguous:${picked.id}:${callerPhone}`,
      });
      return picked;
    }
  }

  // No phone at all, or no existing match — new lead, never left
  // unattributed, same "DM-only lead" reasoning as 27a-iii.
  const { data: newLead } = await supabase
    .from("leads")
    .insert({
      dealership_id: dealershipId,
      name: "Inbound caller",
      phone: callerPhone ?? null,
      source: "inbound_call",
      status: "new",
    })
    .select("id, name, dealership_id")
    .single();
  return newLead;
}
