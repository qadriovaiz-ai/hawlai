import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { scoreLeadFromCall } from "@/lib/agents/callScoringAgent";
import { logVapiUsage } from "@/lib/usage/logUsage";

// Vapi's "Server URL" webhook — configured once in the Vapi dashboard
// (Assistant or Phone Number settings) to point here. Fires on several
// event types during a call; the only one this app acts on is
// end-of-call-report, which carries the full transcript.
export async function POST(request: Request) {
  const body = await request.json();
  const message = body?.message;
  if (!message || message.type !== "end-of-call-report") return NextResponse.json({ received: true });

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
    if (durationSeconds > 0) await logVapiUsage(supabase, callRecord.dealership_id, "ai_call", durationSeconds);
  }

  const { data: lead } = await supabase.from("leads").select("id, name").eq("id", resolvedLeadId).maybeSingle();
  if (!lead) return NextResponse.json({ received: true });

  const result = await scoreLeadFromCall(transcript, lead.name, callRecord ? { supabase, dealershipId: callRecord.dealership_id } : undefined);
  await supabase
    .from("leads")
    .update({
      ai_score: result.score,
      lead_temperature: result.temperature,
      qualification_reason: result.reason,
      status: "called",
    })
    .eq("id", lead.id);

  return NextResponse.json({ received: true });
}
