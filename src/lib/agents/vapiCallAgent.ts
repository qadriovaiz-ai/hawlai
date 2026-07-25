import type { SupabaseClient } from "@supabase/supabase-js";

// Shared core of "trigger an AI call for this lead" — used by both the
// manual "AI Call" button (via /api/calls/trigger, user-authenticated)
// and the automatic new-lead trigger (webhook context, no user
// session, hence takes a service-role client directly rather than
// looking one up itself).

function toE164India(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return phone;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export interface TriggerCallResult {
  success: boolean;
  callId?: string;
  vapiCallId?: string;
  error?: string;
}

export async function triggerVapiCall(
  serviceClient: SupabaseClient,
  lead: { id: string; name: string; phone: string | null; dealership_id: string }
): Promise<TriggerCallResult> {
  if (!lead.phone) return { success: false, error: "Lead has no phone number" };

  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!apiKey || !assistantId || !phoneNumberId) {
    return { success: false, error: "Vapi not fully configured yet — VAPI_ASSISTANT_ID/VAPI_PHONE_NUMBER_ID not set." };
  }

  try {
    const vapiRes = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId,
        phoneNumberId,
        customer: { number: toE164India(lead.phone), name: lead.name },
        // Echoed back by Vapi in every server-URL webhook event (including
        // end-of-call-report) — this is how the webhook correlates a
        // finished call back to the lead without relying on phone-number
        // matching, which breaks if two leads share a formatting quirk.
        metadata: { leadId: lead.id, dealershipId: lead.dealership_id },
      }),
    });

    const vapiData = await vapiRes.json();
    if (!vapiRes.ok) throw new Error(vapiData?.message ?? "Vapi call failed to trigger");

    const { data: callRecord, error: insertError } = await serviceClient
      .from("calls")
      .insert({
        lead_id: lead.id,
        dealership_id: lead.dealership_id,
        status: "initiated",
        vapi_call_id: vapiData.id,
        direction: "outbound",
        triggered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    return { success: true, callId: callRecord.id, vapiCallId: vapiData.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
