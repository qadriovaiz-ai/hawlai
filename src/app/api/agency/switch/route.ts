import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// profiles.dealership_id is the single field every dashboard page/API
// route trusts as "the current business," so switching it is what
// makes the whole app work correctly for the newly-selected team with
// no other code changes needed. Previously this was blocked entirely
// for anyone who owns a dealership, since switching would overwrite
// the pointer to their own business with no way back. P3 agency
// multi-business-switching fix: profiles.home_dealership_id (set once
// at signup, migration 138) now always remembers an owner's own
// business regardless of what dealership_id currently points to, so
// the block is no longer needed — DealershipSwitcher.tsx surfaces a
// "back to my business" option using it.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealershipId } = await request.json();
  if (!dealershipId) return NextResponse.json({ error: "dealershipId required" }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("home_dealership_id").eq("id", user.id).single();

  // Switching to your own home business is authorized by ownership,
  // not team membership — an owner isn't a team_members row of their
  // own business. Everything else still requires real, active team
  // membership on that specific business, confirmed through the
  // user's own RLS-protected session (team_members_self_read), not
  // bypassed.
  if (dealershipId !== profile?.home_dealership_id) {
    const { data: membership } = await supabase.from("team_members").select("id").eq("user_id", user.id).eq("dealership_id", dealershipId).eq("status", "active").maybeSingle();
    if (!membership) return NextResponse.json({ error: "You're not an active team member of that business" }, { status: 403 });
  }

  const service = createServiceClient();
  const { error } = await service.from("profiles").update({ dealership_id: dealershipId }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
