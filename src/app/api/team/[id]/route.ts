import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

async function requireOwnerDealership(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // Same fix as /api/team's requireOwner() — resolve via the active
  // dealership, not an owner_id-only lookup that breaks for 2+ businesses.
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return { error: NextResponse.json({ error: "Only the owner can manage the team" }, { status: 403 }) };
  return { dealership };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error, dealership } = await requireOwnerDealership(supabase);
  if (error) return error;

  const { role } = await request.json();
  const validRoles = ["admin", "marketing_manager", "designer", "content_writer", "sales", "viewer"];
  if (!validRoles.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const { error: updateError } = await supabase.from("team_members").update({ role }).eq("id", id).eq("dealership_id", dealership!.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error, dealership } = await requireOwnerDealership(supabase);
  if (error) return error;

  // Soft-remove — keeps task history intact rather than cascading a
  // hard delete through everything they were ever assigned.
  const { data: removed, error: updateError } = await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("id", id)
    .eq("dealership_id", dealership!.id)
    .select("user_id")
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Clear the removed member's active-business pointer. /api/team/accept
  // sets profiles.dealership_id on invite acceptance, and a few tables
  // (ad_creatives, the two usage tables) key their RLS off that field
  // rather than dealerships.owner_id — so leaving it set kept a removed
  // member's access alive indefinitely. Migration 105 repoints those
  // policies onto live owner/team-membership checks; this clears the
  // stale pointer too, so neither layer alone is load-bearing.
  // Service client because profiles RLS only lets a user write their
  // own row — the owner is removing somebody else.
  if (removed?.user_id) {
    const service = createServiceClient();
    await service.from("profiles").update({ dealership_id: null }).eq("id", removed.user_id);
  }
  return NextResponse.json({ success: true });
}
