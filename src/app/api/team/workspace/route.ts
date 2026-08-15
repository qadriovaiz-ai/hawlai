import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { resolveActiveMembership } from "@/lib/teamMembership";
import { resolveFeatureScope } from "@/lib/teamPermissions";

// Admin/Marketing Manager get a richer view than the plain Task Inbox
// (Designer/Content Writer/Sales/Viewer) — per the frozen UX design,
// they're meant to see a scoped slice of the business, not just their
// own assigned cards. This does NOT reuse the ~50 existing owner-only
// dashboard pages (their queries are hardcoded to owner_id RLS and
// would return empty for a team member) — it's a new, narrow,
// purpose-built read surface, same safety pattern as Task Inbox:
// service-role client, gated by an explicit role check in code, never
// broader table access.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await resolveActiveMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: "Not an active team member" }, { status: 403 });
  if (!["admin", "marketing_manager"].includes(membership.role)) {
    return NextResponse.json({ error: "This view is only for Admin/Marketing Manager roles" }, { status: 403 });
  }

  // A member-level feature_scope override (set by the owner in Team
  // settings) narrows which of these three sections this person
  // actually sees — role only sets the default. Skipping the query
  // entirely for an out-of-scope area rather than fetching then
  // hiding client-side, so a scoped-out area never leaves this route.
  const scope = resolveFeatureScope(membership.role, membership.feature_scope);
  const service = createServiceClient();
  const [{ data: allTasks }, { data: leads }, { data: members }] = await Promise.all([
    scope.includes("tasks")
      ? service.from("tasks").select("id, title, brief, department, status, assigned_to, due_at, created_at, team_members(email, role)").eq("dealership_id", membership.dealership_id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    scope.includes("leads")
      ? service.from("leads").select("id, name, phone, lead_temperature, status, created_at").eq("dealership_id", membership.dealership_id).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
    scope.includes("team")
      ? service.from("team_members").select("id, email, role, status").eq("dealership_id", membership.dealership_id).neq("status", "removed")
      : Promise.resolve({ data: [] }),
  ]);

  const leadCounts = { hot: 0, warm: 0, cold: 0 };
  for (const l of leads ?? []) {
    const temp = (l.lead_temperature ?? "cold") as "hot" | "warm" | "cold";
    if (temp in leadCounts) leadCounts[temp]++;
  }

  return NextResponse.json({
    role: membership.role,
    scope,
    tasks: allTasks ?? [],
    leads: leads ?? [],
    leadCounts,
    teamMembers: members ?? [],
  });
}
