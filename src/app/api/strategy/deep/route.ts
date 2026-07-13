import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateDeepStrategy } from "@/lib/agents/deepStrategyAgent";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const forceRegenerate = searchParams.get("regenerate") === "true";

  // Saved once, reused on every visit — only a fresh Claude call when
  // explicitly asked to regenerate, not on every page open.
  if (!forceRegenerate) {
    const { data: saved } = await supabase.from("deep_strategies").select("strategy").eq("dealership_id", dealershipId).maybeSingle();
    if (saved) return NextResponse.json({ ...saved.strategy, _cached: true });
  }

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, city, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, target_persona, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const strategy = await generateDeepStrategy(
    dealership?.dealership_name ?? "the business",
    dealership?.city ?? null,
    brandProfile,
    dealership?.business_category ?? "car dealership"
  );

  await supabase.from("deep_strategies").upsert(
    { dealership_id: dealershipId, strategy, updated_at: new Date().toISOString() },
    { onConflict: "dealership_id" }
  );

  return NextResponse.json({ ...strategy, _cached: false });
}
