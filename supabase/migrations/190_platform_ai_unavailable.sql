-- ============================================================
-- The in-app alert that tells platform admins AI is down for everyone —
-- the Anthropic credit balance ran out, or the API key was rejected.
--
-- WHY (2026-09-18): when the credits ran out, every AI feature in every
-- department failed with a generic message, and nothing told the
-- operator. lib/ai/claude.ts now classifies that failure and raises one
-- alert an hour to platform admins.
--
-- notifications.kind is CHECK-constrained, and emitNotification swallows
-- errors — a kind missing here would make every one of these alerts
-- silently disappear (the same trap that lost the first Business Story
-- answers, migration 189). Every kind from migration 182, plus
-- platform_ai_unavailable.
-- ============================================================

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
    'email_delivery_problem',
    'platform_ai_unavailable'
  ));
