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
import { notifyOwnerOfApproval } from "../approvals/notifyOwner";

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
  // ─────────────────────────────────────────────────────────────────
  // H3-a — THE NOTICE LIVES HERE, NOT IN requestApproval
  // ─────────────────────────────────────────────────────────────────
  //
  // THIS IS WHY IT IS AN EVENT. s6ExitTest holds that a send cannot be
  // reached from a chat tool at all, with every door open, and
  // requestApproval sits on every approval-raising tool's path — so a
  // notifier called from there is reachable from a tool whatever file
  // the sender happens to live in. Here it is reached only from
  // /api/events/dispatch, which pg_cron calls every two minutes and no
  // tool can walk to.
  //
  // EMAIL TODAY, AND THAT IS THE OWNER'S DECISION (23 November 2026):
  // ship the notice now rather than wait on a Meta template. WhatsApp
  // joins in H3-b/c, through the webhook, which is already the one
  // permitted sender — the reply is WhatsApp either way, because the
  // message carries the four characters H2 matches on.
  approval_raised: [
    async (supabase, event) => {
      const approvalId = event.payload?.approvalId;
      if (!approvalId) return;

      // THE ROW IS RE-READ, NOT TRUSTED FROM THE PAYLOAD. Two reasons,
      // and the second one is the better one:
      //
      //   1. `confirm` exists on the row already, and carrying a copy
      //      in the payload would be a second version of the same
      //      sentence — the drift notifyOwner.ts's header is about.
      //   2. Up to two minutes pass before this runs, and he may have
      //      decided it on the dashboard in that time. Emailing "this
      //      needs your OK" about something already approved is worse
      //      than saying nothing.
      const { data: approval } = await supabase
        .from("pending_approvals")
        .select("id, dealership_id, status, amount, action_details")
        .eq("id", approvalId)
        .maybeSingle();

      if (!approval || approval.status !== "pending") return;

      // SCOPED TO THE EVENT'S OWN BUSINESS. The dispatcher runs every
      // business's events in one loop, so a payload naming another
      // tenant's approval must not address that tenant's owner.
      if (String(approval.dealership_id) !== String(event.dealership_id)) return;

      await notifyOwnerOfApproval(
        supabase,
        event.dealership_id,
        String(approval.id),
        String(approval.action_details?.confirm ?? ""),
        approval.amount ?? null
      );
    },
  ],
};
