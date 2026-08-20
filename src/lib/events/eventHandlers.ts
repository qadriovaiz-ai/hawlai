// P1 Event Bus — subscriber registry. Same shape as ACTION_POLICIES
// in executionPolicy.ts: a plain object map, not a new abstraction
// layer. Add a new event_type here and /api/events/dispatch picks it
// up automatically — no other wiring needed.
//
// lead_converted is deliberately the first and only real subscriber:
// a minimal, honest proof that the full pipeline actually works
// (emit -> event_queue row -> pg_cron -> pg_net -> this dispatch route
// -> this handler -> visible in the Audit Log page) rather than
// building throwaway functionality just to exercise the pipe. Richer
// subscribers arrive as later P1 waves (Task Queue, Goal/Plan,
// Orchestrator, Automation Engine 2.0) actually need to react to
// something.

import { logAuditEvent } from "../audit/logAuditEvent";
import { checkGoalCompletion, notifyGoalTaskFailed } from "../orchestrator/goalOrchestrator";

export type EventHandler = (supabase: any, event: { id: string; dealership_id: string; event_type: string; payload: Record<string, any> }) => Promise<void>;

export const EVENT_HANDLERS: Record<string, EventHandler[]> = {
  lead_converted: [
    async (supabase, event) => {
      await logAuditEvent(supabase, {
        dealershipId: event.dealership_id,
        actor: "event_bus:lead_converted",
        eventType: "event_bus_dispatched",
        resourceType: "lead",
        resourceId: event.payload?.leadId ?? null,
        summary: `Event bus processed lead_converted for "${event.payload?.leadName ?? "a lead"}"`,
        details: { originalEventId: event.id, payload: event.payload },
      });
    },
  ],
  // P1 3a — the Orchestrator's actual wiring: a goal-linked task
  // resolving is what closes the loop set_goal opens at creation.
  task_completed: [
    async (supabase, event) => {
      if (event.payload?.goalId) await checkGoalCompletion(supabase, event.dealership_id, event.payload.goalId);
    },
  ],
  task_failed: [
    async (supabase, event) => {
      if (event.payload?.goalId) await notifyGoalTaskFailed(supabase, event.dealership_id, event.payload.goalId, event.payload.taskTitle ?? "A task", event.payload.error ?? "unknown error");
    },
  ],
};
