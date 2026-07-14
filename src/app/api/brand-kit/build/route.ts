import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateBrandKit } from "@/lib/agents/brandBuildingAgent";

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
  // explicitly asked to regenerate. If the saved row predates the
  // current fields, don't trust it — regenerate instead of blanks.
  if (!forceRegenerate) {
    const { data: saved } = await supabase.from("brand_kits").select("kit, logo_url").eq("dealership_id", dealershipId).maybeSingle();
    if (saved && saved.kit?.tagline && saved.kit?.colors && saved.kit?.socialIdentity) {
      return NextResponse.json({ ...saved.kit, logoUrl: saved.logo_url ?? null, _cached: true });
    }
  }

  const [{ data: dealership }, { data: brandProfile }, { data: existing }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, city, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, target_persona, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("brand_kits").select("logo_url").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const kit = await generateBrandKit(
    dealership?.dealership_name ?? "the business",
    dealership?.city ?? null,
    brandProfile,
    dealership?.business_category ?? "car dealership"
  );

  // Never cache a fallback result — a transient API hiccup shouldn't
  // permanently stick the dealer with placeholder text until they
  // notice and manually hit Regenerate.
  if (!(kit as any)._fallback) {
    await supabase.from("brand_kits").upsert(
      { dealership_id: dealershipId, kit, updated_at: new Date().toISOString() },
      { onConflict: "dealership_id" }
    );
  }

  return NextResponse.json({ ...kit, logoUrl: existing?.logo_url ?? null, _cached: false });
}
