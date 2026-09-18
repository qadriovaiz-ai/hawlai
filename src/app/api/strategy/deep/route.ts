import { createClient } from "@/lib/supabase/server";
import { businessDisplayName } from "@/lib/business/displayName";
import { NextResponse } from "next/server";
import { generateDeepStrategy } from "@/lib/agents/deepStrategyAgent";
import { latestPositioning, competitorContextFrom } from "@/lib/strategy/positioning/run";
import { gatherBusinessFactsSafely, factsPrompt } from "@/lib/claims/businessFacts";
import { aiFailedResponse } from "@/lib/ai/aiFailureResponse";

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
  // explicitly asked to regenerate, not on every page open. But if the
  // saved row predates the current fields (schema changed since it was
  // cached), don't trust it — regenerate instead of showing blanks.
  if (!forceRegenerate) {
    const { data: saved } = await supabase.from("deep_strategies").select("strategy").eq("dealership_id", dealershipId).maybeSingle();
    if (saved && saved.strategy?.businessAnalysis && saved.strategy?.competitorAnalysis && saved.strategy?.targetAudience) {
      return NextResponse.json({ ...saved.strategy, _cached: true });
    }
  }

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, city, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, target_persona, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  // What competitors say in public, from the latest positioning run
  // (lib/strategy/positioning). This used to search Meta's Ad Library API,
  // which returns only political/issue ads outside the EU — it answered
  // "Application does not have permission for this action", so the
  // competitor section was always written with no data.
  const competitorContext = competitorContextFrom(await latestPositioning(supabase, dealershipId));

  // Written from what the business can actually back up (src/lib/claims).
  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  const strategy = await generateDeepStrategy(
    // The name as people read it, not the signup handle.
    businessDisplayName(dealership?.dealership_name),
    dealership?.city ?? null,
    brandProfile,
    dealership?.business_category ?? "business",
    competitorContext,
    { supabase, dealershipId }
  , factsPrompt(facts));
  // The AI failed: say why, save nothing (lib/ai/aiFailureResponse.ts).
  const aiFailed = aiFailedResponse(strategy);
  if (aiFailed) return aiFailed;

  // Never cache a fallback result — a transient API hiccup shouldn't
  // permanently stick the dealer with placeholder text until they
  // notice and manually hit Regenerate.
  if (!(strategy as any)._fallback) {
    await supabase.from("deep_strategies").upsert(
      { dealership_id: dealershipId, strategy, updated_at: new Date().toISOString() },
      { onConflict: "dealership_id" }
    );
  }

  return NextResponse.json({ ...strategy, _cached: false });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { strategy } = await request.json();
  if (!strategy) return NextResponse.json({ error: "strategy required" }, { status: 400 });

  // Single row per dealership (upsert-keyed on dealership_id, no id
  // column to scope by) — PATCH only ever updates an already-generated
  // row, never creates one, matching every other department's "no id,
  // no edit" rule.
  const { error } = await supabase
    .from("deep_strategies")
    .update({ strategy, updated_at: new Date().toISOString() })
    .eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
