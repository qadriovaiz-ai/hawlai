import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { planWebsite } from "@/lib/agents/websiteBuilderAgent";

// Planning-only step: takes the owner's free-form prompt and returns a
// proposed page structure + theme for confirmation. Nothing is written
// to the database here — POST /api/website-builder/generate does that
// once the owner confirms (or edits) the plan.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { prompt } = await request.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const plan = await planWebsite(
    prompt.trim(),
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "business",
    dealership?.city ?? null,
    brandProfile
  );

  return NextResponse.json({ plan, prompt: prompt.trim() });
}
