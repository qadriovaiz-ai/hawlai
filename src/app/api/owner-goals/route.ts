import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Same owner-only resolution as /api/owner-tasks — /dashboard/tasks
// (the surface this feeds) is already an owner-only page, not the
// owner-or-active-team-member pattern used elsewhere (approvals,
// audit log), so this matches that existing scope rather than
// introducing a new one.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: goals, error } = await supabase
    .from("goals")
    .select("id, title, description, target_metric, target_value, deadline, status, created_at")
    .eq("dealership_id", dealership.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!goals || goals.length === 0) return NextResponse.json({ goals: [] });

  const goalIds = goals.map((g) => g.id);
  const [{ data: humanTasks }, { data: agentTasks }] = await Promise.all([
    supabase.from("tasks").select("id, goal_id, title, status").in("goal_id", goalIds),
    supabase.from("agent_tasks").select("id, goal_id, title, status").in("goal_id", goalIds),
  ]);

  const result = goals.map((goal) => {
    const linked = [
      ...(humanTasks ?? []).filter((t) => t.goal_id === goal.id).map((t) => ({ ...t, type: "human" as const })),
      ...(agentTasks ?? []).filter((t) => t.goal_id === goal.id).map((t) => ({ ...t, type: "agent" as const })),
    ];
    // Cancelled tasks don't count toward the denominator — a cancelled
    // piece was never really "part of the plan" going forward, same
    // reasoning TasksView.tsx already applies by grouping cancelled
    // with completed rather than a separate bucket.
    const countable = linked.filter((t) => t.status !== "cancelled");
    const completedCount = countable.filter((t) => t.status === "done").length;
    return { ...goal, tasks: linked, completedCount, totalCount: countable.length };
  });

  return NextResponse.json({ goals: result });
}
