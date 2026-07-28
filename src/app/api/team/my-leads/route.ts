import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Same safety pattern as /api/team/my-tasks: service client, but only
// after confirming — via the caller's own auth.uid() and the
// team_members_self_read RLS policy — that they're really an active
// Sales team member, then scoped to leads.assigned_to = their own
// team_members.id only. A Sales rep can never see a lead assigned to
// a different rep, even by guessing an id.
async function getActiveSalesMembership(supabase: any, userId: string) {
  const { data } = await supabase.from("team_members").select("id, dealership_id, role, status").eq("user_id", userId).eq("status", "active").eq("role", "sales").maybeSingle();
  return data;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getActiveSalesMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: "Not an active Sales team member" }, { status: 403 });

  const service = createServiceClient();
  const { data: leads } = await service
    .from("leads")
    .select("id, name, phone, email, ai_score, lead_temperature, status, qualification_reason, created_at")
    .eq("assigned_to", membership.id)
    .order("ai_score", { ascending: false });

  return NextResponse.json({ leads: leads ?? [] });
}
