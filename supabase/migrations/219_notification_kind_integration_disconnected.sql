-- 219: the owner is told when a connected account stops working.
--
-- WHY. candle_by_qaaf's Search Console connection died on 4 November
-- 2026 and the only trace was an error string on a daily_jobs row. The
-- owner found out three days later, by asking why an email was missing,
-- and Search Console is the instrument the whole local-search plan
-- depends on — so its silent death is the most expensive silence in the
-- product.
--
-- GENERIC ON PURPOSE. Not 'search_console_disconnected': Gmail, YouTube
-- and Google Ads hold refresh tokens from the same Google app and can
-- die the same way, and a kind per integration would mean a migration
-- per integration. The body says which one.
--
-- Same extend-the-constraint pattern as 109/110/121/122/132/190/218,
-- and the list below is 218's with one value added. If 218 has not been
-- run yet, running this one alone is enough — it contains everything
-- 218 does.

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
    'platform_ai_unavailable',
    -- S7/P3 (migration 218).
    'autonomy_lowered',
    -- A connected account stopped working and needs reconnecting. The
    -- body names the integration and quotes the provider's own reason.
    'integration_disconnected'
  ));
