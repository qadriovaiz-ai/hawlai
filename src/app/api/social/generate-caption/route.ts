import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateSocialCaption } from "@/lib/agents/socialMediaAgent";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { claimsNote, priceWarningNote } from "@/lib/claims/claimCheck";
import { aiFailureResponse } from "@/lib/ai/aiFailureResponse";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { prompt } = await request.json();
  if (!prompt || prompt.trim().length < 3) {
    return NextResponse.json({ error: "Describe the post in a few words" }, { status: 400 });
  }

  const [{ data: brandProfile }, { data: dealership }, facts] = await Promise.all([
    supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars, preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("dealerships").select("business_category").eq("id", dealershipId).single(),
    gatherBusinessFactsSafely(supabase, dealershipId),
  ]);

  // Written from, and checked against, what the business can back up
  // (src/lib/claims). The owner reads and edits the caption before
  // posting it, so a price Hawlai can't match is flagged, not removed.
  const { caption, claimsRemoved, priceWarnings, aiFailure } = await generateSocialCaption(prompt, brandProfile, dealership?.business_category ?? "business", { supabase, dealershipId }, facts, "draft");
  // The AI failed: the owner's own words would come back looking like a caption — say why instead.
  if (aiFailure) return aiFailureResponse(aiFailure);
  const note = [claimsNote(claimsRemoved), priceWarningNote(priceWarnings ?? [])].filter(Boolean).join(" ") || null;
  return NextResponse.json({ caption, note });
}
