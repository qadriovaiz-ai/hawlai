-- ============================================================
-- Master audit Part B — proactive push for churn/cold-lead
-- detection, both of which existed only as reactive, on-demand
-- queries (retention/page.tsx, /api/retargeting/segments) with no
-- cron check and no notification. Extends the notifications.kind
-- CHECK constraint from migration 106 with the two new kinds.
--
-- approval_pending is deliberately left alone here — investigation
-- found no code path anywhere that ever creates a pending_approvals
-- row with status = 'pending' (the one insert site, autopilotAgent.ts's
-- auto-pause log, is already status = 'approved'). Wiring that
-- notification kind is out of scope until the underlying
-- pending-approval creation flow actually exists — tracked
-- separately as its own item.
-- ============================================================

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold'
  ));
