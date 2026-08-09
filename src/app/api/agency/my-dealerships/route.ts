import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Powers the dealership switcher. Deliberately only useful for pure
// agency staff (no dealership of their own) — see /api/agency/switch
// for why owners aren't offered switching yet.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: ownedDealership } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).maybeSingle();

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

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();

  return NextResponse.json({
    ownsABusiness: !!ownedDealership,
    dealerships, // every team the person is actively on
    currentDealershipId: profile?.dealership_id ?? null,
  });
}
