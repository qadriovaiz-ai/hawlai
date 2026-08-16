-- Migration 122: New notifications.kind value for a live call
-- escalating to a human — Phase 3 piece 2 ("Escalation") of the AI
-- Communication Employee. Same extend-the-constraint pattern as
-- migrations 109/110/115/121.
--
-- Also restores 'variant_draft_generated' (added by migration 115),
-- which migration 121 silently dropped when it rebuilt this same
-- constraint from an incomplete list — a real regression: autopilotAgent.ts
-- still emits that kind (line 216), and emitNotification() swallows
-- all errors by design, so every such notification has been silently
-- failing since 121 ran. Caught while building this migration, not
-- separately investigated.
--
-- Reframed from the original "live call transfer" ask: no phone
-- number exists anywhere in the schema to transfer a call TO, and
-- inbound calling itself is still dormant (DLT pending) — a real
-- telephony transfer has no live scenario to attach to yet. This
-- ships the "callback-promise" version instead: the AI ends the call
-- gracefully and a human gets alerted with full context, so the
-- caller never has to repeat themselves. True live transfer stays a
-- later, separate upgrade once a real support number + inbound exist.

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'call_needs_follow_up',
    'variant_draft_generated',
    'call_escalated'
  ));
