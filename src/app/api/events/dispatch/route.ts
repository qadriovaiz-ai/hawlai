import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { EVENT_HANDLERS } from "@/lib/events/eventHandlers";
import { TASK_EXECUTORS } from "@/lib/tasks/taskExecutors";
import { emitEvent } from "@/lib/events/emitEvent";

// Triggered by pg_cron every 2 minutes (see migration 129's commented
// manual setup) via pg_net, which sends the same
// `Authorization: Bearer $CRON_SECRET` shape /api/autopilot/daily-run
// already checks — same secret, same pattern, so both crons are
// authorized identically.
//
// P1 9b — this same route also drains agent_tasks now, reusing the
// Event Bus's existing pg_cron/pg_net trigger rather than standing up
// a second frequent-poll schedule (per the confirmed Wave 3 decision).
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[event-dispatch] CRON_SECRET is not set — this endpoint is currently unprotected.");
  }

  const supabase = createServiceClient();

  // Bounded batch per run — this fires every 2 minutes, so a backlog
  // drains within a few runs rather than one run trying to do
  // everything and risking a serverless timeout.
  const { data: pendingEvents, error: eventsError } = await supabase
    .from("event_queue")
    .select("id, dealership_id, event_type, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  let eventsDone = 0;
  let eventsFailed = 0;
  for (const event of pendingEvents ?? []) {
    const handlers = EVENT_HANDLERS[event.event_type];
    if (!handlers || handlers.length === 0) {
      // No subscriber registered for this event_type — not an error,
      // just nothing to do yet. Marked done so it doesn't sit
      // "pending" forever waiting on a handler that may never exist.
      await supabase.from("event_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", event.id);
      eventsDone++;
      continue;
    }
    try {
      for (const handler of handlers) await handler(supabase, event);
      await supabase.from("event_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", event.id);
      eventsDone++;
    } catch (err: any) {
      await supabase.from("event_queue").update({
        status: "failed",
        error: err.message,
        attempts: (event.attempts ?? 0) + 1,
        processed_at: new Date().toISOString(),
      }).eq("id", event.id);
      eventsFailed++;
    }
  }

  // agent_tasks (P1 9b) — same bounded-batch reasoning as event_queue
  // above, plus scheduled_for so a task queued for later doesn't run
  // early.
  const { data: pendingTasks, error: tasksError } = await supabase
    .from("agent_tasks")
    .select("id, dealership_id, action_type, action_details, title, attempts, goal_id")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (tasksError) return NextResponse.json({ error: tasksError.message }, { status: 500 });

  let tasksDone = 0;
  let tasksFailed = 0;
  let tasksSkipped = 0;
  for (const task of pendingTasks ?? []) {
    const executor = TASK_EXECUTORS[task.action_type];
    if (!executor) {
      // No executor registered for this action_type yet — left
      // pending (not marked done), unlike an unhandled event: a
      // queued task is real work someone's waiting on, so it stays
      // visibly unresolved rather than silently disappearing.
      tasksSkipped++;
      continue;
    }
    try {
      const result = await executor(supabase, task);
      await supabase.from("agent_tasks").update({ status: "done", result: result ?? null, completed_at: new Date().toISOString() }).eq("id", task.id);
      tasksDone++;
      // P1 3a — only goal-linked tasks matter for the Orchestrator.
      if (task.goal_id) await emitEvent(supabase, { dealershipId: task.dealership_id, eventType: "task_completed", payload: { goalId: task.goal_id } });
    } catch (err: any) {
      // P1 19b — capped at 3 total attempts, same "don't hammer a
      // transient failure" reasoning as callClaudeWithRetry/metaPost
      // (19a): a genuinely broken task won't fix itself by retrying
      // faster, and each extra attempt multiplies across every pending
      // task on every 2-minute run.
      const attempts = (task.attempts ?? 0) + 1;
      const willRetry = attempts < 3;
      await supabase.from("agent_tasks").update(
        willRetry
          ? { status: "pending", error: err.message, attempts, scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString() }
          : { status: "failed", error: err.message, attempts, completed_at: new Date().toISOString() }
      ).eq("id", task.id);
      tasksFailed++;
      // Only notify on terminal failure — a transient hiccup that
      // self-heals on retry shouldn't page the owner.
      if (!willRetry && task.goal_id) await emitEvent(supabase, { dealershipId: task.dealership_id, eventType: "task_failed", payload: { goalId: task.goal_id, taskTitle: task.title, error: err.message } });
    }
  }

  return NextResponse.json({
    events: { processed: pendingEvents?.length ?? 0, done: eventsDone, failed: eventsFailed },
    tasks: { processed: pendingTasks?.length ?? 0, done: tasksDone, failed: tasksFailed, skipped: tasksSkipped },
  });
}
