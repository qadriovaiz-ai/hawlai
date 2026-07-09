import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateFollowUpMessage } from "@/lib/agents/contentAgent";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { channel } = body;
  if (!channel || !["whatsapp", "email"].includes(channel)) {
    return NextResponse.json({ error: "channel must be 'whatsapp' or 'email'" }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("name, vehicle, budget, lead_temperature, status")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .single();

  if (leadError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars, preferred_language")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  const message = await generateFollowUpMessage(channel, lead, brandProfile);
  return NextResponse.json(message);
}
