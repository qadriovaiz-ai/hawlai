// ------------------------------------------------------------------
// Central AI Orchestrator — P1 Wave 5 (3a)
// ------------------------------------------------------------------
// Deliberately minimal and reactive: closes the one concrete loop that
// was missing after Waves 1-4 — set_goal decomposes a goal into tasks
// once, at creation, but nothing then watches them over time. Nothing
// anywhere in the codebase ever set goals.status = 'completed'.
//
// This is NOT an autonomous "decide what to do next" planner — it
// only auto-completes a goal once its real work is actually done, and
// notifies the owner when a step needs a human. No automatic
// re-planning on failure (deliberately deferred, same reasoning as
// 8b) — that's more P2 "agentic" territory than P1 coordination.
// ------------------------------------------------------------------

import { emitNotification } from "../notifications/emit";

export async function checkGoalCompletion(supabase: any, dealershipId: string, goalId: string) {
  const { data: goal } = await supabase.from("goals").select("id, title, status").eq("id", goalId).maybeSingle();
  if (!goal || goal.status !== "active") return; // already completed/abandoned, or doesn't exist

  const [{ data: humanTasks }, { data: agentTasks }] = await Promise.all([
    supabase.from("tasks").select("status").eq("goal_id", goalId),
    supabase.from("agent_tasks").select("status").eq("goal_id", goalId),
  ]);
  // Cancelled tasks don't block completion — same reasoning as 8b's
  // progress bar, which already excludes them from its denominator.
  const countable = [...(humanTasks ?? []), ...(agentTasks ?? [])].filter((t) => t.status !== "cancelled");
  if (countable.length === 0 || !countable.every((t) => t.status === "done")) return;

  await supabase.from("goals").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", goalId);
  await emitNotification(supabase, {
    dealershipId,
    kind: "goal_completed",
    title: `Goal completed: "${goal.title}"`,
    body: "Every task in this goal's plan is done.",
    href: "/dashboard/tasks",
    dedupeKey: `goal_completed:${goalId}`,
  });
}

export async function notifyGoalTaskFailed(supabase: any, dealershipId: string, goalId: string, taskTitle: string, errorMessage: string) {
  const { data: goal } = await supabase.from("goals").select("title").eq("id", goalId).maybeSingle();
  await emitNotification(supabase, {
    dealershipId,
    kind: "goal_task_failed",
    title: `A step in "${goal?.title ?? "your goal"}" needs attention`,
    body: `"${taskTitle}" didn't complete automatically — ${errorMessage}`,
    href: "/dashboard/tasks",
    dedupeKey: `goal_task_failed:${goalId}:${taskTitle}`,
  });
}
