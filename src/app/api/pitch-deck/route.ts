import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateDeckContent, buildPitchDeckPptx, type DeckBrandKit, type DeckProduct } from "@/lib/agents/pitchDeckAgent";
import { fetchLogoBuffer } from "@/lib/agents/agencyBrandingAgent";

const DEFAULT_ACCENT = "7C3AED";
const DARK = "1E293B";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const [{ data: dealership }, { data: brandKitRow }, { data: brandProfile }, { data: products }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, city, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_kits").select("kit, logo_url").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("products").select("name, description, price").eq("dealership_id", dealershipId).eq("is_active", true).order("order_index", { ascending: true }).limit(4),
  ]);

  const name = dealership?.dealership_name ?? "Your Business";
  const kit = brandKitRow?.kit as { colors?: { name: string; hex: string; role: string }[]; tagline?: string; mission?: string; vision?: string; brandStory?: string } | null;
  const brandKit: DeckBrandKit | null = kit
    ? { colors: kit.colors ?? [], tagline: kit.tagline, mission: kit.mission, vision: kit.vision, brandStory: kit.brandStory }
    : null;
  const deckProducts: DeckProduct[] = (products ?? []).map((p: any) => ({ name: p.name, description: p.description, price: p.price }));

  const content = await generateDeckContent(
    name,
    dealership?.city ?? null,
    dealership?.business_category ?? "business",
    brandKit,
    deckProducts,
    brandProfile?.tone_of_voice,
    { supabase, dealershipId }
  );

  const primaryColor = brandKit?.colors.find((c) => c.role.toLowerCase().includes("primary"))?.hex ?? brandKit?.colors[0]?.hex;
  const accentHex = (primaryColor ?? `#${DEFAULT_ACCENT}`).replace("#", "").toUpperCase();
  const logo = await fetchLogoBuffer(brandKitRow?.logo_url ?? null);

  const buffer = await buildPitchDeckPptx(content, { accentHex, darkHex: DARK, logo });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${name.replace(/[^a-z0-9]+/gi, "-")}-pitch-deck.pptx"`,
    },
  });
}
