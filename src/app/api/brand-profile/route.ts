import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LANGUAGE, cleanBrandColors, cleanToneTags, isPreferredLanguage } from "@/lib/onboarding/brand";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  return NextResponse.json(brandProfile ?? null);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();

  const { tone_of_voice, target_persona, messaging_pillars, preferred_language, brand_voice, business_description, brand_colors, tone_tags } = body;

  const upsertPayload: Record<string, any> = {
    dealership_id: dealershipId,
    tone_of_voice: tone_of_voice ?? null,
    target_persona: target_persona ?? {},
    messaging_pillars: messaging_pillars ?? [],
    // VALIDATED NOW. It was taken on trust, and the only caller that
    // sent it sent a hardcoded "hinglish" for every business
    // (WelcomeChatCard, fixed in P4). An unknown value is refused
    // below rather than written.
    preferred_language: isPreferredLanguage(preferred_language) ? preferred_language : DEFAULT_LANGUAGE,
  };
  // Only touch brand_voice when the caller explicitly sent it — omitting
  // the key (not just sending null) is how BrandProfileForm.tsx's
  // existing PATCH calls, which never send this field, leave a
  // previously-set structured profile untouched on conflict instead of
  // silently wiping it out every time the owner edits any other field.
  if (brand_voice !== undefined) upsertPayload.brand_voice = brand_voice;

  // Same guard, same reason (migration 159). This is the SOURCE TEXT
  // the voice was derived from, so losing it is worse than losing a
  // derived field — it's the only copy of what the owner actually
  // said, and it can't be reconstructed from the profile. Any caller
  // that doesn't send the key leaves it untouched.
  if (business_description !== undefined) upsertPayload.business_description = business_description;

  // Onboarding step 4 (migration 213). Same omitted-key rule as the two
  // above: a caller that does not send the key leaves what is stored
  // alone, so BrandProfileForm's existing PATCHes cannot wipe the
  // owner's colours by editing an unrelated field.
  //
  // CLEANED THROUGH THE SAME FUNCTIONS THE SCREEN USES, so what is
  // stored is what he saw: normalised, de-duplicated, capped, and only
  // the tone words we actually offered. A non-array is refused rather
  // than coerced — the column's CHECK would refuse it anyway, and a
  // sentence beats a constraint violation.
  if (preferred_language !== undefined && preferred_language !== null && !isPreferredLanguage(preferred_language)) {
    return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  }

  if (brand_colors !== undefined) {
    if (!Array.isArray(brand_colors)) {
      return NextResponse.json({ error: "Brand colours must be a list" }, { status: 400 });
    }
    upsertPayload.brand_colors = cleanBrandColors(brand_colors);
  }
  if (tone_tags !== undefined) {
    if (!Array.isArray(tone_tags)) {
      return NextResponse.json({ error: "Tone must be a list" }, { status: 400 });
    }
    upsertPayload.tone_tags = cleanToneTags(tone_tags);
  }

  const { data, error } = await supabase
    .from("brand_profiles")
    .upsert(upsertPayload, { onConflict: "dealership_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
