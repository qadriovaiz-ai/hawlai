import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateLandingPageCopy } from "@/lib/agents/websiteAgent";
import { gatherBusinessFactsSafely, factsPrompt } from "@/lib/claims/businessFacts";
import { aiFailedResponse } from "@/lib/ai/aiFailureResponse";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, city, business_category")
    .eq("id", dealershipId)
    .single();

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars, preferred_language")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  // Written from what the business can actually back up (src/lib/claims).
  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  // "Our Dealership" was the fallback name — from the car-dealership
  // era, and wrong for every business since. A business always has a
  // name; if the read failed, say so rather than naming them something
  // they are not.
  const name = (dealership?.dealership_name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "Couldn't read your business name, so no page copy was written. Try again in a moment." },
      { status: 503 }
    );
  }
  const copy = await generateLandingPageCopy(name, dealership?.city ?? null, brandProfile, dealership?.business_category ?? "business", { supabase, dealershipId }, factsPrompt(facts));
  // The AI failed: say why, save nothing (lib/ai/aiFailureResponse.ts).
  const aiFailed = aiFailedResponse(copy);
  if (aiFailed) return aiFailed;
  // A field the fallback deliberately left empty is the owner's to
  // write — an invented claim on their live page is not recoverable.
  const toWrite = (["subheadline", "offer_text"] as const).filter((k) => !String((copy as any)[k] ?? "").trim());
  return NextResponse.json({
    ...copy,
    ...(toWrite.length ? { needsOwnerInput: toWrite, note: `Hawlai couldn't write ${toWrite.join(" and ").replace(/_/g, " ")} from what's on record — add ${toWrite.length === 1 ? "it" : "them"} yourself in Website Builder.` } : {}),
  });
}
