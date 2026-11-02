import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cleanBusinessModels } from "@/lib/business/businessModel";

// Mirrors migration 149's CHECK constraint. 'full' is included so a
// customer can explicitly choose "show me everything" — distinct from
// null, which means "never asked" (every pre-existing business).
const VALID_PRODUCT_MODES = ["calling", "marketing", "automation", "research", "website", "full"];

// Mirrors migration 212's CHECK constraint. A DIFFERENT AXIS from
// product_mode: this is where the business already is, that one is
// what the owner wants. null means never asked, as it does there.
const VALID_ONLINE_PRESENCES = ["website", "maps", "social", "none"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("dealerships")
    .select("dealership_name, city, business_category, product_mode, business_address, business_models, online_presence, online_presence_detail")
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

  const { business_category, onboarding_completed, product_mode, onboarding_intent_text, business_address, business_models, online_presence, online_presence_detail, dealership_name, city } = await request.json();

  const models = business_models === undefined ? undefined : cleanBusinessModels(business_models);
  if (models === null) {
    return NextResponse.json({ error: "Choose from products, services, subscriptions or business customers" }, { status: 400 });
  }

  if (business_address !== undefined && business_address !== null && (typeof business_address !== "string" || business_address.trim().length > 300)) {
    return NextResponse.json({ error: "Keep the address under 300 characters" }, { status: 400 });
  }

  if (business_category !== undefined && business_category.trim().length < 2) {
    return NextResponse.json({ error: "Enter a business type" }, { status: 400 });
  }

  // Onboarding step 3 confirms these, so it has to be able to correct
  // them. The name is read all over the product, which is why it may be
  // changed but never blanked.
  if (dealership_name !== undefined) {
    if (typeof dealership_name !== "string" || dealership_name.trim().length < 2) {
      return NextResponse.json({ error: "Enter your business name" }, { status: 400 });
    }
    if (dealership_name.trim().length > 120) {
      return NextResponse.json({ error: "Keep the business name under 120 characters" }, { status: 400 });
    }
  }

  // A CITY MAY BE CLEARED, and that is not the same as not answering:
  // plenty of businesses are not in one place, and step 3 does not
  // require it.
  if (city !== undefined && city !== null && (typeof city !== "string" || city.trim().length > 120)) {
    return NextResponse.json({ error: "Keep the city under 120 characters" }, { status: 400 });
  }

  // Validated against the same set as the DB CHECK constraint
  // (migration 149) — a bad value should fail here with a clear
  // message rather than as a Postgres constraint violation.
  if (product_mode !== undefined && product_mode !== null && !VALID_PRODUCT_MODES.includes(product_mode)) {
    return NextResponse.json({ error: "Unknown product mode" }, { status: 400 });
  }

  // Validated here against the same set as migration 212's CHECK, so a
  // bad value fails with a sentence rather than as a Postgres
  // constraint violation on the first screen of someone's first session.
  if (online_presence !== undefined && online_presence !== null && !VALID_ONLINE_PRESENCES.includes(online_presence)) {
    return NextResponse.json({ error: "Unknown online presence" }, { status: 400 });
  }

  if (
    online_presence_detail !== undefined &&
    online_presence_detail !== null &&
    (typeof online_presence_detail !== "string" || online_presence_detail.trim().length > 500)
  ) {
    return NextResponse.json({ error: "Keep that under 500 characters" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("dealerships")
    .update({
      ...(business_category !== undefined && { business_category: business_category.trim() }),
      ...(models !== undefined && { business_models: models }),
      ...(onboarding_completed !== undefined && { onboarding_completed }),
      ...(product_mode !== undefined && { product_mode }),
      // Printed in every marketing email's footer; blank clears it (and
      // marketing email stops until it's set again).
      ...(business_address !== undefined && { business_address: typeof business_address === "string" && business_address.trim() ? business_address.trim() : null }),
      ...(dealership_name !== undefined && { dealership_name: dealership_name.trim() }),
      ...(city !== undefined && { city: typeof city === "string" && city.trim() ? city.trim() : null }),
      ...(online_presence !== undefined && { online_presence }),
      ...(online_presence_detail !== undefined && {
        online_presence_detail:
          typeof online_presence_detail === "string" && online_presence_detail.trim() ? online_presence_detail.trim() : null,
      }),
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
