import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Deliberately safe-scoped: only lets a person switch if they don't
// own a dealership themselves. profiles.dealership_id is set once at
// signup for an owner (their own business) and nothing else ever
// writes to it — every one of the ~53 dashboard pages and ~69 API
// routes already trusts this single field as "the current business,"
// so switching it is what makes the entire existing app work
// correctly for the newly-selected client with no other code changes
// needed. But that also means switching it for an OWNER would
// overwrite the pointer to their own business with no way back
// (nothing tracks a separate "home" dealership yet) — so for now,
// switching is only offered to people with no business of their own,
// where there's no original value at risk of being lost. Owners who
// also want to do agency-style work for other businesses is a real,
// separate feature to build later (needs a distinct
// "home_dealership_id" column so switching never overwrites it).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealershipId } = await request.json();
  if (!dealershipId) return NextResponse.json({ error: "dealershipId required" }, { status: 400 });

  const { data: ownedDealership } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).maybeSingle();
  if (ownedDealership) {
    return NextResponse.json({ error: "Switching isn't available yet for accounts that own their own business — this is a planned upgrade." }, { status: 403 });
  }

  // Real authorization: confirmed through the user's own RLS-
  // protected session (team_members_self_read), not bypassed.
  const { data: membership } = await supabase.from("team_members").select("id").eq("user_id", user.id).eq("dealership_id", dealershipId).eq("status", "active").maybeSingle();
  if (!membership) return NextResponse.json({ error: "You're not an active team member of that business" }, { status: 403 });

  const service = createServiceClient();
  const { error } = await service.from("profiles").update({ dealership_id: dealershipId }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
