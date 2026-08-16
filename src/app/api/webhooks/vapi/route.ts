import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { scoreLeadFromCall } from "@/lib/agents/callScoringAgent";
import { logVapiUsage } from "@/lib/usage/logUsage";
import { recordCallingMinutes } from "@/lib/usage/callingMinutes";
import { buildInboundSystemPrompt, buildInboundFirstMessage } from "@/lib/agents/callScriptAgent";
import { getBusinessContext, handleVapiToolCalls } from "@/lib/businessBrain";
import { recordCallOutcomeInsight } from "@/lib/businessMemory/outcomeInsights";

// Vapi's "Server URL" webhook — configured once in the Vapi dashboard
// (Assistant or Phone Number settings) to point here. Fires on several
// event types during a call; this app acts on three of them:
// end-of-call-report (the full transcript, once a call ends),
// assistant-request (fired the instant an INBOUND call arrives at a
// number whose Server URL is this endpoint, before the call connects —
// Vapi expects an assistant config back in the response so it knows who
// should answer), and tool-calls (fired mid-call when the model wants
// to invoke a tool — see toolDispatcher.ts; provably inert today since
// no assistant config this app sends declares any tools).
export async function POST(request: Request) {
  const body = await request.json();
  const message = body?.message;
  if (!message) return NextResponse.json({ received: true });

  if (message.type === "assistant-request") return handleAssistantRequest(message);
  if (message.type === "tool-calls") return handleToolCallsRequest(message);
  if (message.type !== "end-of-call-report") return NextResponse.json({ received: true });

  const vapiCallId = message.call?.id;
  const leadId = message.call?.metadata?.leadId;
  if (!vapiCallId) return NextResponse.json({ received: true });

  const supabase = createServiceClient();

  const { data: callRecord } = await supabase.from("calls").select("id, lead_id, dealership_id").eq("vapi_call_id", vapiCallId).maybeSingle();
  // Fall back to the metadata leadId if we somehow don't have a local
  // row yet (shouldn't normally happen — the row is created at the
  // moment the call is triggered).
  const resolvedLeadId = callRecord?.lead_id ?? leadId;
  if (!resolvedLeadId) return NextResponse.json({ received: true });

  const transcript: string = message.artifact?.transcript ?? message.transcript ?? "";
  const summary: string = message.analysis?.summary ?? message.summary ?? "";
  const durationSeconds = Math.round((message.durationMs ?? message.call?.durationMs ?? 0) / 1000);
  const endedReason: string = message.endedReason ?? "";

  const status = endedReason.includes("no-answer") ? "no_answer"
    : endedReason.includes("voicemail") ? "voicemail"
    : endedReason.includes("busy") ? "busy"
    : endedReason.includes("failed") || endedReason.includes("error") ? "failed"
    : "completed";

  if (callRecord) {
    await supabase.from("calls").update({ status, duration: durationSeconds, transcript, summary }).eq("id", callRecord.id);
    if (durationSeconds > 0) {
      await logVapiUsage(supabase, callRecord.dealership_id, "ai_call", durationSeconds);
      await recordCallingMinutes(callRecord.dealership_id, durationSeconds);
    }
  }

  const { data: lead } = await supabase.from("leads").select("id, name, dealership_id").eq("id", resolvedLeadId).maybeSingle();
  if (!lead) return NextResponse.json({ received: true });

  const dealershipId = callRecord?.dealership_id ?? lead.dealership_id;
  const result = await scoreLeadFromCall(transcript, lead.name, callRecord ? { supabase, dealershipId } : undefined);

  if (callRecord) {
    await supabase.from("calls").update({ intent: result.intent, sentiment: result.sentiment, urgency: result.urgency }).eq("id", callRecord.id);
  }

  await supabase
    .from("leads")
    .update({
      ai_score: result.score,
      lead_temperature: result.temperature,
      qualification_reason: result.reason,
      status: "called",
    })
    .eq("id", lead.id);

  if (callRecord) {
    await recordCallOutcomeInsight(supabase, { id: callRecord.id, dealershipId, leadName: lead.name, temperature: result.temperature, reason: result.reason, urgency: result.urgency });
  }

  return NextResponse.json({ received: true });
}

// Mid-call tool-calling — see toolDispatcher.ts for the full safety
// contract. dealershipId/leadId come from the same call.metadata
// object triggerVapiCall() already sets on every outbound call (see
// vapiCallAgent.ts); inbound calls don't carry a leadId today, which
// is fine — handleVapiToolCalls() treats it as optional. This branch
// can only fire once a call's assistant config actually declares
// tools, which nothing in this app does yet (Phase 2 territory) — so
// in practice this is currently unreachable, not just defensively coded.
async function handleToolCallsRequest(message: any): Promise<NextResponse> {
  const dealershipId = message.call?.metadata?.dealershipId ?? "";
  const leadId = message.call?.metadata?.leadId ?? null;
  const response = await handleVapiToolCalls(message, { dealershipId, leadId });
  return NextResponse.json(response);
}

// Resolves which dealership owns the dialed number (by
// dealerships.vapi_phone_number_id, admin-assigned — see migration
// 096_dedicated_phone_number.sql) and returns a dynamically-built
// assistant config for it, mirroring what triggerVapiCall() already does
// for outbound calls. This only fires once a business actually has a
// dedicated number wired up in Vapi's dashboard with this route as its
// Server URL — no real numbers are provisioned yet (DLT registration
// pending), so in practice this path is dormant infrastructure until then.
async function handleAssistantRequest(message: any): Promise<NextResponse> {
  const phoneNumberId: string | undefined = message.phoneNumber?.id ?? message.call?.phoneNumberId;
  const apiKey = process.env.VAPI_API_KEY;
  const fallbackAssistantId = process.env.VAPI_ASSISTANT_ID;

  if (!phoneNumberId) {
    return NextResponse.json(fallbackAssistantId ? { assistantId: fallbackAssistantId } : { error: "No assistant configured" });
  }

  const supabase = createServiceClient();
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("id, vapi_assistant_id")
    .eq("vapi_phone_number_id", phoneNumberId)
    .maybeSingle();

  // Unrecognized number (or no business assigned to it yet) — fall back
  // to the shared platform assistant rather than failing the call.
  if (!dealership) {
    return NextResponse.json(fallbackAssistantId ? { assistantId: fallbackAssistantId } : { error: "No business assigned to this number" });
  }

  const assistantId = dealership.vapi_assistant_id || fallbackAssistantId;
  if (!assistantId || !apiKey) {
    return NextResponse.json(assistantId ? { assistantId } : { error: "Vapi not fully configured" });
  }

  try {
    // Business Brain's shared context (name/category/tone/knowledge
    // facts) — the phone-number lookup above already found this
    // dealership's row, so this re-fetches name/category once more,
    // a negligible cost on a path that's dormant until real dedicated
    // numbers are provisioned, traded for staying on the same shared
    // module the outbound path uses (see vapiCallAgent.ts).
    const [assistantRes, businessCtx] = await Promise.all([
      fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers: { Authorization: `Bearer ${apiKey}` } }),
      getBusinessContext(supabase, dealership.id),
    ]);
    const baseAssistant = assistantRes.ok ? await assistantRes.json() : null;
    if (!baseAssistant) return NextResponse.json({ assistantId });

    const systemPrompt = buildInboundSystemPrompt({
      dealershipName: businessCtx.name,
      businessCategory: businessCtx.category,
      toneOfVoice: businessCtx.toneOfVoice,
      knowledgeFacts: businessCtx.knowledgeFacts,
    });
    const firstMessage = buildInboundFirstMessage(businessCtx.name);

    return NextResponse.json({
      assistant: {
        ...baseAssistant,
        id: undefined,
        firstMessage,
        model: {
          ...baseAssistant.model,
          messages: [{ role: "system", content: systemPrompt }],
        },
      },
    });
  } catch (err: any) {
    console.error("[vapi-webhook] assistant-request dynamic build failed, falling back to static assistant:", err.message);
    return NextResponse.json({ assistantId });
  }
}
