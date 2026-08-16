-- Migration 121: New notifications.kind value for call outcomes that
-- need a human — Phase 2 piece 1 of the AI Communication Employee
-- ("Actions"). Extends the same CHECK constraint migrations 109 and
-- 110 already extended, following that exact pattern.
--
-- No new table — this reuses the existing notifications sink +
-- emitNotification() rather than building a separate ticket system.
-- Trigger logic (calls.intent = 'complaint' or calls.urgency = 'high')
-- lives in the end-of-call webhook, not here.

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'call_needs_follow_up'
  ));
