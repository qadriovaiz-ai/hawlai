-- Same extend-the-constraint pattern as 109/110/115/121/122/124.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'call_needs_follow_up',
    'variant_draft_generated',
    'call_escalated',
    'refund_requested',
    'goal_completed','goal_task_failed'
  ));
