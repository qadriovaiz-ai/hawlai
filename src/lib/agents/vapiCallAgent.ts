import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDynamicSystemPrompt, buildFirstMessage } from "./callScriptAgent";

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

// Fetches the base assistant's voice/transcriber/model-provider
// settings from Vapi so the dynamic call keeps whatever voice quality
// was already tuned in the dashboard — only the actual script
// (messages/firstMessage) gets replaced per-business. Returns null on
// any failure so the caller can fall back to the plain assistantId
// path rather than breaking the call entirely over this.
async function fetchBaseAssistantConfig(apiKey: string, assistantId: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

  // Real business context for the script — not fabricated. Pulls the
  // same dealership_name/business_category/tone_of_voice fields every
  // other department already uses, plus the lead's own real
  // qualification_reason from a prior interaction if one exists.
  let callBody: Record<string, any> = { assistantId };
  try {
    const [{ data: dealership }, { data: brandProfile }, { data: leadRecord }] = await Promise.all([
      serviceClient.from("dealerships").select("dealership_name, business_category").eq("id", lead.dealership_id).single(),
      serviceClient.from("brand_profiles").select("tone_of_voice").eq("dealership_id", lead.dealership_id).maybeSingle(),
      serviceClient.from("leads").select("qualification_reason").eq("id", lead.id).maybeSingle(),
    ]);

    const baseAssistant = await fetchBaseAssistantConfig(apiKey, assistantId);
    if (baseAssistant && dealership) {
      const systemPrompt = buildDynamicSystemPrompt({
        dealershipName: dealership.dealership_name,
        businessCategory: dealership.business_category ?? "business",
        toneOfVoice: brandProfile?.tone_of_voice,
        leadName: lead.name,
        qualificationReason: leadRecord?.qualification_reason,
      });
      const firstMessage = buildFirstMessage(dealership.dealership_name, lead.name);

      // Keep everything already tuned (voice, transcriber, provider) —
      // only replace the actual script.
      callBody = {
        assistant: {
          ...baseAssistant,
          id: undefined, // sending this back as a NEW transient assistant for this call, not updating the stored one
          firstMessage,
          model: {
            ...baseAssistant.model,
            messages: [{ role: "system", content: systemPrompt }],
          },
        },
      };
    }
    // If fetching the base config or dealership context failed for any
    // reason, callBody stays as the plain { assistantId } fallback set
    // above — the call still goes out with the static script rather
    // than failing outright.
  } catch (err: any) {
    console.error("[vapi-call] dynamic script build failed, falling back to static assistant:", err.message);
  }

  try {
    const vapiRes = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...callBody,
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
