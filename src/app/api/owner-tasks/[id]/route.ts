import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { emitEvent } from "@/lib/events/emitEvent";

// Owner-side task actions — mark done, cancel. Didn't exist before this
// redesign: the Tasks screen's own subtitle promised tasks were "yours
// to approve, edit, or reassign" but there was no PATCH endpoint for
// the `tasks` table from the owner's side at all — only
// /api/team/my-tasks/[id], scoped to a team member updating their own
// assigned task. (There's also /api/tasks/[id], but that operates on
// the unrelated `lead_tasks` table, not this one.)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await request.json();
  if (!["done", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "status must be 'done' or 'cancelled'" }, { status: 400 });
  }

  // tasks_owner_all RLS already scopes updates to rows whose
  // dealership_id is owned by this user — the regular client is enough,
  // no service client/explicit ownership check needed. A task belonging
  // to someone else's business just matches 0 rows.
  const update: Record<string, any> = { status };
  if (status === "done") update.completed_at = new Date().toISOString();

  const { data, error } = await supabase.from("tasks").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // P1 3a — only goal-linked tasks matter for the Orchestrator; a
  // standalone task has nothing to check completion against.
  if (status === "done" && data.goal_id) {
    await emitEvent(supabase, { dealershipId: data.dealership_id, eventType: "task_completed", payload: { goalId: data.goal_id } });
  }

  return NextResponse.json(data);
}
