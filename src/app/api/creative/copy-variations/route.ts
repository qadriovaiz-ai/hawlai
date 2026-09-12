import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateCopyVariations } from "@/lib/agents/creativeAgent";
import { gatherBusinessFactsSafely, factsPrompt } from "@/lib/claims/businessFacts";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { topic } = await request.json();
  if (!topic || topic.trim().length < 2) return NextResponse.json({ error: "Topic is too short" }, { status: 400 });

  const [{ data: brandProfile }, { data: dealership }] = await Promise.all([
    supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars, preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("dealerships").select("business_category").eq("id", dealershipId).single(),
  ]);

  // Written from what the business can actually back up (src/lib/claims).
  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  const variations = await generateCopyVariations(topic.trim(), brandProfile, 3, dealership?.business_category ?? "business", { supabase, dealershipId }, factsPrompt(facts));
  return NextResponse.json({ variations });
}
