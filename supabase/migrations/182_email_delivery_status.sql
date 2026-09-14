-- ============================================================
-- Email delivery status from Resend's webhook, and the notification
-- that tells the owner when an email bounced, was marked as spam, was
-- blocked or failed.
--
-- The three email_sends columns were applied by hand on 2026-09-14,
-- before this file existed; re-declared here with IF NOT EXISTS so the
-- repo matches the live schema and a fresh database gets them.
-- ============================================================

alter table email_sends add column if not exists delivery_status text;
alter table email_sends add column if not exists delivery_error text;
alter table email_sends add column if not exists delivered_at timestamptz;

-- Every kind from migration 180, plus email_delivery_problem.
-- emitNotification swallows errors, so a kind missing here would make
-- every one of these notifications silently disappear.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'call_needs_follow_up',
    'variant_draft_generated',
    'call_escalated',
    'refund_requested',
    'goal_completed','goal_task_failed',
    'lead_merge_needs_review',
    'platform_spend_alert',
    'out_of_season_content',
    'email_delivery_problem'
  ));
