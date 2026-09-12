import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateRetentionMessage } from "@/lib/agents/retentionAgent";
import { getLeadMemory } from "@/lib/businessMemory/getLeadMemory";
import { gatherBusinessFactsSafely, factsPrompt } from "@/lib/claims/businessFacts";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { leadId, angle } = await request.json();
  if (!leadId || !["service_reminder", "referral", "upsell"].includes(angle)) {
    return NextResponse.json({ error: "leadId and a valid angle are required" }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("name, vehicle")
    .eq("id", leadId)
    .eq("dealership_id", dealershipId)
    .single();
  if (leadError || !lead) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const [{ data: brandProfile }, { data: dealership }, pastInsights] = await Promise.all([
    supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars, preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("dealerships").select("business_category").eq("id", dealershipId).single(),
    getLeadMemory(supabase, dealershipId, leadId),
  ]);

  // Written from what the business can actually back up (src/lib/claims).
  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  const message = await generateRetentionMessage(lead, brandProfile, angle, dealership?.business_category ?? "business", { supabase, dealershipId }, pastInsights, factsPrompt(facts));
  return NextResponse.json({ message });
}
