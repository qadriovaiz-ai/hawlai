import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { triggerVapiCall } from "@/lib/agents/vapiCallAgent";

// UX Transformation, piece 5c — "Call my phone".
//
// Deliberately runs through the REAL pipeline rather than a simulated
// one. calls.lead_id is `not null` and read in ~10 places including
// the Vapi webhook's scoring and appointment writeback, so rather
// than making it nullable (risking the one genuinely proven calling
// path), a test call uses a real lead row marked source='test_call'.
//
// That constraint turned out to be a feature: the test exercises
// exactly what a customer call will do — same prompt, same persona,
// same tools, same boundaries, same scoring afterwards — instead of a
// special-cased branch that could pass while the real path is broken.
//
// The test lead is REUSED across tests rather than recreated, so
// repeated testing doesn't litter the CRM, and it's deletable from
// the result screen.

const TEST_LEAD_SOURCE = "test_call";

async function resolveOwnedDealership(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };

  const { data: owned } = await supabase
    .from("dealerships").select("id").eq("id", dealershipId).eq("owner_id", user.id).maybeSingle();
  if (!owned) return { error: NextResponse.json({ error: "Only the business owner can run a test call" }, { status: 403 }) };

  return { dealershipId };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;
  const { dealershipId } = resolved;

  const { phone, name } = await request.json();
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) {
    return NextResponse.json({ error: "Enter a valid phone number with country code, e.g. +91 98765 43210." }, { status: 400 });
  }

  const service = createServiceClient();
  const testName = (typeof name === "string" && name.trim()) || "Test call";

  // Reuse this business's existing test lead if there is one — a new
  // row per test would fill the CRM with duplicates.
  const { data: existing } = await service
    .from("leads")
    .select("id")
    .eq("dealership_id", dealershipId)
    .eq("source", TEST_LEAD_SOURCE)
    .limit(1)
    .maybeSingle();

  let leadId = existing?.id as string | undefined;

  if (leadId) {
    await service.from("leads").update({ name: testName, phone: String(phone).trim() }).eq("id", leadId);
  } else {
    const { data: created, error: createError } = await service
      .from("leads")
      .insert({
        dealership_id: dealershipId,
        name: testName,
        phone: String(phone).trim(),
        source: TEST_LEAD_SOURCE,
        // Explicitly not opted out — this is the owner testing their
        // own setup on their own number.
        dnd_opt_out: false,
      })
      .select("id")
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: "Couldn't set up the test — please try again." }, { status: 500 });
    }
    leadId = created.id;
  }

  const { data: lead } = await service
    .from("leads")
    .select("id, name, phone, dealership_id, dnd_opt_out")
    .eq("id", leadId!)
    .single();

  const result = await triggerVapiCall(service, lead as any);

  if (!result.success) {
    // Surfaced verbatim rather than replaced with a generic message:
    // the real failures here are actionable and specific ("Vapi not
    // configured yet", "no phone number provisioned"), and hiding
    // them would leave an owner with no idea what to fix.
    return NextResponse.json({ error: result.error, leadId }, { status: 400 });
  }

  return NextResponse.json({ success: true, callId: result.callId, leadId });
}

// Polled by the test screen while the call runs. The Vapi webhook
// writes the transcript, summary and score when the call ends, so
// this reads the same record any real call produces.
export async function GET(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;
  const { dealershipId } = resolved;

  const { searchParams } = new URL(request.url);
  const callId = searchParams.get("callId");
  if (!callId) return NextResponse.json({ error: "callId required" }, { status: 400 });

  const service = createServiceClient();
  const { data: call } = await service
    .from("calls")
    .select("id, status, summary, transcript, duration, lead_id, created_at")
    .eq("id", callId)
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  // What the AI actually learned, from the same scoring the real
  // pipeline runs — this is the honest answer to "did it work?"
  const { data: lead } = await service
    .from("leads")
    .select("name, lead_temperature, ai_score, qualification_reason, status")
    .eq("id", call.lead_id)
    .maybeSingle();

  const { count: appointmentCount } = await service
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", call.lead_id)
    .gte("created_at", call.created_at);

  return NextResponse.json({
    call: {
      status: call.status,
      summary: call.summary,
      durationSeconds: call.duration ?? 0,
      hasTranscript: !!call.transcript,
    },
    learned: lead
      ? {
          temperature: lead.lead_temperature,
          score: lead.ai_score,
          reason: lead.qualification_reason,
          status: lead.status,
        }
      : null,
    appointmentsBooked: appointmentCount ?? 0,
  });
}

// Removes the test lead and everything attached to it (calls cascade
// on lead delete), so a business can clean up after testing.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;
  const { dealershipId } = resolved;

  const service = createServiceClient();
  // Scoped to source='test_call' as well as the dealership — this
  // endpoint must never be able to delete a real customer record.
  const { error } = await service
    .from("leads")
    .delete()
    .eq("dealership_id", dealershipId)
    .eq("source", TEST_LEAD_SOURCE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
