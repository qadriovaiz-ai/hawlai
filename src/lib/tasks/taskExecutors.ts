// P1 9b — executor registry for agent_tasks, same plain-object shape
// as eventHandlers.ts's EVENT_HANDLERS. Deliberately empty for now:
// per the 9a/9b proposal, nothing in the codebase today has a real
// "do this later, not in this chat turn" need that isn't already
// handled some other way (video generation has its own async status-
// polling, workflows already run synchronously in the daily cron).
// Wave 4 (Goal -> Plan -> Task) is the first real producer that will
// queue rows here and need actual executors registered.
//
// A task whose action_type has no registered executor is left
// "pending" rather than auto-marked done (unlike event_queue's
// dispatch, which marks an unhandled event done since notifications
// are fire-and-forget) — a queued task is a real piece of work someone
// is waiting on, so it should stay visibly unresolved until either an
// executor exists or someone cancels it, not silently disappear.

export type TaskExecutor = (supabase: any, task: { id: string; dealership_id: string; action_type: string; action_details: Record<string, any>; title: string }) => Promise<any>;

export const TASK_EXECUTORS: Record<string, TaskExecutor> = {};
