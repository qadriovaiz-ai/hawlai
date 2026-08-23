import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Mirrors migration 149's CHECK constraint. 'full' is included so a
// customer can explicitly choose "show me everything" — distinct from
// null, which means "never asked" (every pre-existing business).
const VALID_PRODUCT_MODES = ["calling", "marketing", "automation", "research", "website", "full"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("dealerships")
    .select("dealership_name, city, business_category, product_mode")
    .eq("id", dealershipId)
    .single();

  return NextResponse.json(data ?? null);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { business_category, onboarding_completed, product_mode, onboarding_intent_text } = await request.json();

  if (business_category !== undefined && business_category.trim().length < 2) {
    return NextResponse.json({ error: "Enter a business type" }, { status: 400 });
  }

  // Validated against the same set as the DB CHECK constraint
  // (migration 149) — a bad value should fail here with a clear
  // message rather than as a Postgres constraint violation.
  if (product_mode !== undefined && product_mode !== null && !VALID_PRODUCT_MODES.includes(product_mode)) {
    return NextResponse.json({ error: "Unknown product mode" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("dealerships")
    .update({
      ...(business_category !== undefined && { business_category: business_category.trim() }),
      ...(onboarding_completed !== undefined && { onboarding_completed }),
      ...(product_mode !== undefined && { product_mode }),
      ...(onboarding_intent_text !== undefined && {
        onboarding_intent_text: typeof onboarding_intent_text === "string" ? onboarding_intent_text.slice(0, 500) : null,
      }),
    })
    .eq("id", dealershipId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
