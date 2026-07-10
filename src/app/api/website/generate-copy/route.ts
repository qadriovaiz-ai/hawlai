import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateLandingPageCopy } from "@/lib/agents/websiteAgent";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, city")
    .eq("id", dealershipId)
    .single();

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars, preferred_language")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  const copy = await generateLandingPageCopy(dealership?.dealership_name ?? "Our Dealership", dealership?.city ?? null, brandProfile);
  return NextResponse.json(copy);
}
