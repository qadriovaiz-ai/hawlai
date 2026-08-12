import { createClient } from "@/lib/supabase/server";
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
  const { tone_of_voice, target_persona, messaging_pillars, preferred_language, brand_voice } = body;

  const upsertPayload: Record<string, any> = {
    dealership_id: dealershipId,
    tone_of_voice: tone_of_voice ?? null,
    target_persona: target_persona ?? {},
    messaging_pillars: messaging_pillars ?? [],
    preferred_language: preferred_language ?? "hinglish",
  };
  // Only touch brand_voice when the caller explicitly sent it — omitting
  // the key (not just sending null) is how BrandProfileForm.tsx's
  // existing PATCH calls, which never send this field, leave a
  // previously-set structured profile untouched on conflict instead of
  // silently wiping it out every time the owner edits any other field.
  if (brand_voice !== undefined) upsertPayload.brand_voice = brand_voice;

  const { data, error } = await supabase
    .from("brand_profiles")
    .upsert(upsertPayload, { onConflict: "dealership_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
