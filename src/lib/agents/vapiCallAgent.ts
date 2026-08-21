import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDynamicSystemPrompt, buildFirstMessage } from "./callScriptAgent";
import { getBusinessContext, getCallEnabledVapiTools } from "../businessBrain";
import { AGENT_PERSONAS, resolvePersona } from "./personas";

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
  lead: { id: string; name: string; phone: string | null; dealership_id: string; dnd_opt_out?: boolean | null }
): Promise<TriggerCallResult> {
  if (!lead.phone) return { success: false, error: "Lead has no phone number" };
  // Master audit Part C1.3 — single choke point for every outbound
  // call trigger (manual button, auto-call-new-lead, chat tool), so
  // gating here covers all three at once.
  if (lead.dnd_opt_out) return { success: false, error: "Lead has opted out of contact (DND)" };

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Vapi not configured yet — VAPI_API_KEY not set." };
  }

  // Real business context for the script — not fabricated. Name/
  // category/tone/knowledge facts come from the shared, channel-
  // agnostic Business Brain module (also used by the inbound call
  // webhook, and eventually chat/WhatsApp). Call-specific config
  // (Vapi IDs, owner-written overrides) isn't part of that shared
  // context — it's fetched here directly, alongside the lead's own
  // qualification_reason from a prior interaction if one exists. Null
  // vapi_phone_number_id/vapi_assistant_id is the normal case today
  // (every business shares the platform default, see migration
  // 096_dedicated_phone_number.sql) until real numbers can be
  // provisioned.
  let dealershipCallConfig: { vapi_phone_number_id: string | null; vapi_assistant_id: string | null; custom_call_instructions: string | null; custom_first_message: string | null } | null = null;
  let leadRecord: { qualification_reason: string | null } | null = null;
  let businessCtx: Awaited<ReturnType<typeof getBusinessContext>> | null = null;
  // P3 piece 5 — defaults to the sales persona (this path's original,
  // unchanged behavior) unless the owner reassigned this channel.
  let persona = AGENT_PERSONAS.sales;
  try {
    // leadId scopes businessCtx.memories to this lead specifically
    // (getLeadMemory, P1 4a) instead of the dealership-wide feed — one
    // fetch through the shared assembler rather than a separate
    // parallel call (P1 5a folded this in).
    const [businessCtxRes, dealershipCallConfigRes, leadRecordRes, personaRes] = await Promise.all([
      getBusinessContext(serviceClient, lead.dealership_id, lead.id),
      serviceClient.from("dealerships").select("vapi_phone_number_id, vapi_assistant_id, custom_call_instructions, custom_first_message").eq("id", lead.dealership_id).single(),
      serviceClient.from("leads").select("qualification_reason").eq("id", lead.id).maybeSingle(),
      resolvePersona(serviceClient, lead.dealership_id, "call_outbound"),
    ]);
    businessCtx = businessCtxRes;
    dealershipCallConfig = dealershipCallConfigRes.data;
    leadRecord = leadRecordRes.data;
    persona = personaRes;
  } catch (err: any) {
    console.error("[vapi-call] failed loading dealership context, falling back to platform defaults:", err.message);
  }

  const assistantId = dealershipCallConfig?.vapi_assistant_id || process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = dealershipCallConfig?.vapi_phone_number_id || process.env.VAPI_PHONE_NUMBER_ID;
  if (!assistantId || !phoneNumberId) {
    return { success: false, error: "Vapi not fully configured yet — VAPI_ASSISTANT_ID/VAPI_PHONE_NUMBER_ID not set." };
  }

  let callBody: Record<string, any> = { assistantId };
  try {
    const baseAssistant = await fetchBaseAssistantConfig(apiKey, assistantId);
    if (baseAssistant && businessCtx) {
      // Live tool-calling — getCallEnabledVapiTools() renders whatever's
      // channels:["call"] in toolRegistry.ts into Vapi's function-
      // calling schema. If Vapi rejects a malformed tools array, the
      // call simply fails to start below (vapiRes.ok check) with a
      // clear error — it cannot corrupt or crash a call already in
      // progress. Prompt flags are derived from which tool names are
      // actually present, not just "tools.length > 0" — so the prompt
      // never claims a capability that isn't really attached.
      // P3 piece 5 — scoped to the persona's own tool grant (e.g. the
      // sales persona has no refund handling). The prompt flags below
      // derive from what's actually attached after this filter, so the
      // prompt still never claims a capability the model doesn't have.
      const callTools = getCallEnabledVapiTools().filter((t) => persona.callTools.includes(t.function.name));
      const callToolNames = callTools.map((t) => t.function.name);
      const systemPrompt = buildDynamicSystemPrompt({
        dealershipName: businessCtx.name,
        businessCategory: businessCtx.category,
        toneOfVoice: businessCtx.toneOfVoice,
        leadName: lead.name,
        qualificationReason: leadRecord?.qualification_reason,
        pastInsights: businessCtx.memories,
        personaGoals: persona.goals,
        customInstructions: dealershipCallConfig?.custom_call_instructions,
        knowledgeFacts: businessCtx.knowledgeFacts,
        canBookAppointments: callToolNames.includes("create_appointment"),
        canUpdateLead: callToolNames.includes("update_lead"),
        canCheckOrders: callToolNames.includes("check_order_status"),
        canEscalate: callToolNames.includes("escalate_to_human"),
        canLogComplaint: callToolNames.includes("log_complaint"),
        canRequestRefund: callToolNames.includes("request_refund"),
      });
      const firstMessage = buildFirstMessage(businessCtx.name, lead.name, dealershipCallConfig?.custom_first_message);

      // Keep everything already tuned (voice, transcriber, provider) —
      // only replace the actual script (and now, the tools).
      callBody = {
        assistant: {
          ...baseAssistant,
          id: undefined, // sending this back as a NEW transient assistant for this call, not updating the stored one
          firstMessage,
          model: {
            ...baseAssistant.model,
            messages: [{ role: "system", content: systemPrompt }],
            ...(callTools.length > 0 ? { tools: callTools } : {}),
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
