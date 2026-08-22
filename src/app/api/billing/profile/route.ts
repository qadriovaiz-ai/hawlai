import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Phase 4 / 1a — a business's own billing identity (legal name,
// GSTIN, billing address). Separate from dealerships.dealership_name,
// which is a trade name and not necessarily what belongs on an
// invoice.
//
// Owner-writable (unlike invoices, which are admin-only) — this is
// the customer's own information about themselves, and they're the
// only ones who actually know it. billing_profiles has SELECT-only
// RLS, so the write goes through the service-role client AFTER
// ownership is proven here.

async function resolveOwnedDealership(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };

  // Billing identity is the OWNER's to set, not a team member's — a
  // sales-role member shouldn't be able to change the legal entity a
  // business gets invoiced as.
  const { data: owned } = await supabase
    .from("dealerships").select("id").eq("id", dealershipId).eq("owner_id", user.id).maybeSingle();
  if (!owned) return { error: NextResponse.json({ error: "Only the business owner can manage billing details" }, { status: 403 }) };

  return { dealershipId };
}

export async function GET() {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;

  // RLS already scopes this to the caller's own dealership.
  const { data } = await supabase
    .from("billing_profiles")
    .select("*")
    .eq("dealership_id", resolved.dealershipId)
    .maybeSingle();

  return NextResponse.json({ profile: data ?? null });
}

const FIELDS = [
  "legal_business_name", "gstin",
  "billing_address_line1", "billing_address_line2",
  "billing_city", "billing_state", "billing_pincode", "billing_email",
] as const;

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;

  const body = await request.json();
  const update: Record<string, any> = { dealership_id: resolved.dealershipId, updated_at: new Date().toISOString() };
  for (const field of FIELDS) {
    if (field in body) {
      const value = typeof body[field] === "string" ? body[field].trim() : body[field];
      update[field] = value === "" ? null : value;
    }
  }

  // GSTIN is 15 characters in a fixed format. Validated for SHAPE
  // only — that a string looks like a GSTIN, not that it's real or
  // belongs to this business. Verifying against the GST portal is a
  // separate integration, and whether it's required is one of the
  // open CA questions.
  if (update.gstin) {
    const gstin = String(update.gstin).toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      return NextResponse.json({ error: "That doesn't look like a valid GSTIN — it should be 15 characters, like 27AAPFU0939F1ZV." }, { status: 400 });
    }
    update.gstin = gstin;
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("billing_profiles")
    .upsert(update, { onConflict: "dealership_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profile: data });
}
