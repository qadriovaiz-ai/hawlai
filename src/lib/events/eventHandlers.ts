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
  // A site was just published: tell Google the sitemap changed.
  // THROWS when it did not happen, so the dispatcher records the event
  // as failed with the reason — a quiet "done" here would be the exact
  // silence this exists to end. Platform-wide, so the business id is not
  // needed; one sitemap lists every shop.
  site_published: [
    async () => {
      const { ensurePlatformSitemap } = await import("@/lib/seo/sitemapSubmit");
      const result = await ensurePlatformSitemap();
      if (!result.submitted) throw new Error(result.error);
    },
  ],
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
  // P-b — THE OPPORTUNITY LEAVES THE APP
  // ─────────────────────────────────────────────────────────────────
  //
  // Emitted by emitNotification for the three kinds the owner chose
  // (PUSHED_KINDS), and ONLY when a row was really written — so this
  // runs on a fact that is new, not on the same fact every morning.
  //
  // REACH ONLY. It says where the opportunity is and what to do; the
  // decision is the owner's. Nothing here acts, and nothing here
  // raises an approval either.
  //
  // WHY IT IS AN EVENT AND NOT A CALL FROM THE DETECTOR. The detectors
  // run inside the daily job list; the dispatcher runs every two
  // minutes. `hot_lead` comes from the meta-leads WEBHOOK and can fire
  // at any hour, and this is what gets it out of the app within
  // minutes instead of at 03:00 tomorrow.
  //
  // ONE EMAIL PER FACT, keyed on the notification's own dedupe key.
  // The event queue retries a failed handler, and a retry must not ask
  // him twice about one thing.
  opportunity_noticed: [
    async (supabase, event) => {
      const kind = event.payload?.kind;
      const title = event.payload?.title;
      if (!kind || !title) return;

      const { ownerEmail, sendDealerEmail } = await import("@/lib/email/sendDealerEmail");
      const { opportunityEmail } = await import("@/lib/notifications/opportunityEmail");
      const { businessDisplayName } = await import("@/lib/business/displayName");
      const { PLACEHOLDER_BUSINESS_NAME } = await import("@/lib/onboarding/signup");

      const { data: dealership } = await supabase
        .from("dealerships")
        .select("dealership_name, owner_id")
        .eq("id", event.dealership_id)
        .maybeSingle();

      // No address on record is not an error — the bell still has it.
      const to = await ownerEmail(dealership?.owner_id ?? null);
      if (!to) return;

      const { subject, body } = opportunityEmail(
        businessDisplayName(dealership?.dealership_name, PLACEHOLDER_BUSINESS_NAME),
        { kind, title, body: event.payload?.body ?? null, href: event.payload?.href ?? null }
      );

      await sendDealerEmail(supabase, event.dealership_id, to, subject, body, {
        idempotencyKey: `opportunity:${event.payload?.dedupeKey ?? event.id}`,
      });
    },
  ],
};
