import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { triggerVapiCall } from "@/lib/agents/vapiCallAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { lead_id } = await request.json();
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const serviceClient = createServiceClient();

  const { data: lead, error: leadError } = await serviceClient
    .from("leads")
    .select("id, name, phone, dealership_id")
    .eq("id", lead_id)
    .eq("dealership_id", dealershipId)
    .single();

  if (leadError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const result = await triggerVapiCall(serviceClient, lead);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ success: true, call: { id: result.callId }, vapi_call_id: result.vapiCallId });
}
