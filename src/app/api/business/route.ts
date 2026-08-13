import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/featureGate";

// Multi-business relies on dealerships.owner_id already allowing many
// rows per owner (no unique constraint, and dealerships_owner_all's RLS
// policy is "owner_id = auth.uid()" — not scoped to one row) — so no
// schema change was needed to let an owner hold several businesses.
// What's new here is the application-level concept of an "active"
// business (profiles.dealership_id, switched via /api/business/switch)
// and the multiBusiness plan gate on creating additional ones.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();

  const { data: businesses } = await supabase
    .from("dealerships")
    .select("id, dealership_name, city, plan")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    businesses: (businesses ?? []).map((b) => ({ ...b, active: b.id === profile?.dealership_id })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const activeDealershipId = profile?.dealership_id;
  if (!activeDealershipId) return NextResponse.json({ error: "No active business" }, { status: 400 });

  // Gated against the currently active business's plan, matching every
  // other feature gate in the app (plans are per-dealership, not
  // per-owner-account) — an Agency-plan business can add more businesses;
  // those new businesses start on their own Free plan.
  const gate = await requireFeature(supabase, activeDealershipId, "multiBusiness");
  if (!gate.allowed) return gate.response;

  const { dealershipName, city } = await request.json();
  if (!dealershipName || !dealershipName.trim()) {
    return NextResponse.json({ error: "Business name required" }, { status: 400 });
  }

  const { data: newBusiness, error } = await supabase
    .from("dealerships")
    .insert({ dealership_name: dealershipName.trim(), city: city?.trim() || null, owner_id: user.id })
    .select("id, dealership_name, city, plan")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Switch into the new business immediately, same as signup does for
  // a first business — otherwise nothing about it is reachable yet.
  await supabase.from("profiles").update({ dealership_id: newBusiness.id }).eq("id", user.id);

  return NextResponse.json({ success: true, business: newBusiness });
}
