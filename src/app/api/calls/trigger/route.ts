import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

function toE164India(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return phone;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

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
    .select("id, name, phone, vehicle, dealership_id")
    .eq("id", lead_id)
    .eq("dealership_id", dealershipId)
    .single();

  if (leadError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });

  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!apiKey || !assistantId || !phoneNumberId) {
    return NextResponse.json(
      {
        error:
          "Vapi not fully configured yet. Create an Assistant and buy a phone number in your Vapi dashboard, then set VAPI_ASSISTANT_ID and VAPI_PHONE_NUMBER_ID in Vercel env vars.",
      },
      { status: 400 }
    );
  }

  try {
    const vapiRes = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId,
        phoneNumberId,
        customer: {
          number: toE164India(lead.phone),
          name: lead.name,
        },
      }),
    });

    const vapiData = await vapiRes.json();
    if (!vapiRes.ok) {
      throw new Error(vapiData?.message ?? "Vapi call failed to trigger");
    }

    const { data: callRecord, error: insertError } = await serviceClient
      .from("calls")
      .insert({
        lead_id: lead.id,
        dealership_id: dealershipId,
        status: "initiated",
        vapi_call_id: vapiData.id,
        direction: "outbound",
        triggered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ success: true, call: callRecord, vapi_call_id: vapiData.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
