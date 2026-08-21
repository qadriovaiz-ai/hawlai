import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateSeoIdeas } from "@/lib/agents/seoAgent";

// P3 piece 6 — AI-suggested keywords for a Google Search campaign,
// reusing seoAgent's existing real keyword generation rather than a
// second, parallel keyword generator. This is only ever a STARTING
// POINT: the dealer edits/adds/removes freely before launch, and
// whatever they end up with is what /api/ads/google/launch uses —
// the suggestion never becomes the final word on its own.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { topic } = await request.json();
  if (!topic || String(topic).trim().length < 2) {
    return NextResponse.json({ error: "What are you advertising? Add a bit more detail." }, { status: 400 });
  }

  const { data: dealership } = await supabase
    .from("dealerships").select("city, business_category").eq("id", dealershipId).single();

  const ideas = await generateSeoIdeas(
    String(topic).trim(),
    dealership?.city,
    dealership?.business_category ?? "business",
    { supabase, dealershipId }
  );

  // Prefer the transactional/commercial ones — someone searching to
  // buy is worth more per click than someone reading up on a topic.
  const details = ideas.keywordDetails ?? [];
  const ranked = [
    ...details.filter((k) => k.intent === "transactional"),
    ...details.filter((k) => k.intent !== "transactional"),
  ].map((k) => k.keyword);

  return NextResponse.json({ keywords: (ranked.length > 0 ? ranked : ideas.keywords).slice(0, 15) });
}
