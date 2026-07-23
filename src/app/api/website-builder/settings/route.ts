import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_THEMES = ["navy_amber", "crimson_charcoal", "forest_cream", "midnight_sky"];
const VALID_SHIPPING_MODES = ["free", "flat", "free_above"];

// Site-level settings (logo, theme) that the owner should be able to
// change on their own, without triggering a full content regeneration —
// unlike POST /api/website-builder/generate, this never touches pages
// or sections.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const update: Record<string, any> = {};
  if (body.logoUrl !== undefined) update.logo_url = body.logoUrl || null;
  if (body.themeKey !== undefined) {
    if (!VALID_THEMES.includes(body.themeKey)) return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
    update.theme_key = body.themeKey;
  }
  if (body.shippingMode !== undefined) {
    if (!VALID_SHIPPING_MODES.includes(body.shippingMode)) return NextResponse.json({ error: "Invalid shipping mode" }, { status: 400 });
    update.shipping_mode = body.shippingMode;
  }
  if (body.shippingRate !== undefined) {
    const rate = Number(body.shippingRate);
    if (isNaN(rate) || rate < 0) return NextResponse.json({ error: "Shipping rate must be a positive number" }, { status: 400 });
    update.shipping_rate = rate;
  }
  if (body.shippingFreeThreshold !== undefined) {
    if (body.shippingFreeThreshold === null || body.shippingFreeThreshold === "") {
      update.shipping_free_threshold = null;
    } else {
      const threshold = Number(body.shippingFreeThreshold);
      if (isNaN(threshold) || threshold < 0) return NextResponse.json({ error: "Free shipping threshold must be a positive number" }, { status: 400 });
      update.shipping_free_threshold = threshold;
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: website, error } = await supabase
    .from("websites")
    .update(update)
    .eq("dealership_id", dealershipId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ website });
}
