import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

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

  const { data: membership } = await supabase.from("team_members").select("id, dealership_id, role, status").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not an active team member" }, { status: 403 });
  if (!["admin", "marketing_manager"].includes(membership.role)) {
    return NextResponse.json({ error: "This view is only for Admin/Marketing Manager roles" }, { status: 403 });
  }

  const service = createServiceClient();
  const [{ data: allTasks }, { data: leads }, { data: members }] = await Promise.all([
    service.from("tasks").select("id, title, brief, department, status, assigned_to, due_at, created_at, team_members(email, role)").eq("dealership_id", membership.dealership_id).order("created_at", { ascending: false }).limit(50),
    service.from("leads").select("id, name, phone, lead_temperature, status, created_at").eq("dealership_id", membership.dealership_id).order("created_at", { ascending: false }).limit(20),
    service.from("team_members").select("id, email, role, status").eq("dealership_id", membership.dealership_id).neq("status", "removed"),
  ]);

  const leadCounts = { hot: 0, warm: 0, cold: 0 };
  for (const l of leads ?? []) {
    const temp = (l.lead_temperature ?? "cold") as "hot" | "warm" | "cold";
    if (temp in leadCounts) leadCounts[temp]++;
  }

  return NextResponse.json({
    role: membership.role,
    tasks: allTasks ?? [],
    leads: leads ?? [],
    leadCounts,
    teamMembers: members ?? [],
  });
}
