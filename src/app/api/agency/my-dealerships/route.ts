import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Powers the dealership switcher — for pure agency staff (switching
// between client teams) and, as of the P3 agency fix, for owners who
// are also staff on someone else's team (homeDealership below is
// their way back). See /api/agency/switch.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Existence check, not a row-resolution — see /api/agency/switch for
  // why .maybeSingle() silently mis-evaluates this for a 2+ business owner.
  const { data: ownedDealerships } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).limit(1);

  // team_members_self_read RLS (user_id = auth.uid()) makes this
  // genuinely safe on the normal client — no service client needed
  // just to see which teams you're on.
  const { data: memberships } = await supabase.from("team_members").select("dealership_id, role").eq("user_id", user.id).eq("status", "active");

  const dealershipIds = (memberships ?? []).map((m) => m.dealership_id);
  let dealerships: { id: string; dealership_name: string; role: string }[] = [];
  if (dealershipIds.length > 0) {
    const service = createServiceClient();
    const { data } = await service.from("dealerships").select("id, dealership_name").in("id", dealershipIds);
    const roleById = new Map((memberships ?? []).map((m) => [m.dealership_id, m.role]));
    dealerships = (data ?? []).map((d) => ({ id: d.id, dealership_name: d.dealership_name, role: roleById.get(d.id) ?? "viewer" }));
  }

  const { data: profile } = await supabase.from("profiles").select("dealership_id, home_dealership_id").eq("id", user.id).single();

  // P3 agency multi-business-switching fix — an owner who's also
  // staff on a different team needs a way back; resolved here (not
  // left to the client) since RLS on dealerships already scopes this
  // safely to a business the user actually owns.
  let homeDealership: { id: string; dealership_name: string } | null = null;
  if (profile?.home_dealership_id) {
    const { data } = await supabase.from("dealerships").select("id, dealership_name").eq("id", profile.home_dealership_id).maybeSingle();
    homeDealership = data;
  }

  return NextResponse.json({
    ownsABusiness: !!(ownedDealerships && ownedDealerships.length > 0),
    dealerships, // every team the person is actively on
    currentDealershipId: profile?.dealership_id ?? null,
    homeDealership,
  });
}
