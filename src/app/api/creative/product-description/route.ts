import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateProductDescription } from "@/lib/agents/creativeAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { carModel, details } = await request.json();
  if (!carModel || carModel.trim().length < 2) return NextResponse.json({ error: "Car model is required" }, { status: 400 });

  const [{ data: brandProfile }, { data: dealership }] = await Promise.all([
    supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars, preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("dealerships").select("business_category").eq("id", dealershipId).single(),
  ]);
  const listing = await generateProductDescription(carModel.trim(), details ?? "", brandProfile, dealership?.business_category ?? "car dealership");
  return NextResponse.json(listing);
}
