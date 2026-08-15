-- ============================================================
-- Master audit Part B — budget-overrun alerts (Phase 2).
--
-- Extends notifications.kind (migration 106, extended in 109) with
-- two new kinds. No other schema change needed — the budget data
-- already exists (ad_creatives.daily_budget, campaign_performance_
-- history.spend for the current snapshot_date).
-- ============================================================

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun'
  ));
