import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { resolveActiveMembership } from "@/lib/teamMembership";

// A team member's own client has no RLS access to the tasks table
// (tasks RLS is owner-only, by design — see migration 070's comment).
// This route is the one deliberate exception: it uses the service
// client, but only after confirming — via the caller's own auth.uid()
// and the team_members_self_read RLS policy — that they really are an
// active team member, then scopes every query to their own
// team_members.id. This is real access control enforced in
// application code for one narrow, well-understood surface, not a
// bypass.
// Membership resolution lives in the shared helper so the multi-team
// case is handled identically everywhere — see src/lib/teamMembership.ts.
async function getActiveMembership(supabase: any, userId: string) {
  return resolveActiveMembership(supabase, userId);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: "Not an active team member" }, { status: 403 });

  const service = createServiceClient();
  const { data: tasks } = await service
    .from("tasks")
    .select("id, title, brief, department, context, status, due_at, created_at, completed_at")
    .eq("assigned_to", membership.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ role: membership.role, tasks: tasks ?? [] });
}
