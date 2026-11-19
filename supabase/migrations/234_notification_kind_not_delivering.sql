-- 234: the owner is told when an ad is Active and reaching nobody.
--
-- WHY. A campaign launched on 10 September 2026 read Active in Hawlai
-- and in Ads Manager, at the campaign, the ad set and the ad, with zero
-- impressions and zero spend, until 19 November. Nobody was told.
--
-- The sentence already existed — notDeliveringNote() says exactly this
-- and names that campaign in its comment — but it is a DISPLAY function
-- in a client component. It fires when somebody opens Analytics and
-- looks at the row. Nobody opened it for seventy days.
--
-- And nothing in the daily run could have caught it. budget_alerts
-- compares spend against the daily budget, so a campaign spending zero
-- is comfortably UNDER budget: the one state that means broken was
-- indistinguishable from the thriftiest campaign on the account.
--
-- NOT A BUDGET ALERT, AND NOT A STATUS CHANGE. It is its own kind
-- because it is its own fact — "this is on, and it has never reached a
-- single person" — and because the alert fires once per campaign per
-- cause rather than daily, which is a different dedupe rule from every
-- kind above it.
--
-- WHAT FOUND THIS. tests/autonomyDemotion.test.ts, which pins the
-- NotificationKind union against the newest migration that rewrites
-- this constraint. The TypeScript was added first and the test failed:
-- without this migration every one of these alerts would have been
-- REJECTED BY THE DATABASE, and emitNotification swallows its errors by
-- design ("best-effort — never break the real work this rides along
-- with"). So the detector would have run daily, found the silence, and
-- been silent about it. The same shape of bug it exists to fix.
--
-- Same extend-the-constraint pattern as 109/110/121/122/132/190/218/219,
-- and the list below is 219's with one value added. If 219 has not been
-- run yet, running this one alone is enough — it contains everything
-- 219 does.

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
    -- A connected account stopped working (migration 219).
    'integration_disconnected',
    -- Active on Meta, and it has never shown anybody anything.
    'campaign_not_delivering'
  ));

-- VERIFY. Expected: the constraint definition, containing
-- 'campaign_not_delivering' and all 22 kinds before it.
--
-- select pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'notifications_kind_check';
--
-- AND a row of the new kind is now accepted. Expected: INSERT 0 1,
-- then the delete removes it again.
--
-- begin;
-- insert into notifications (dealership_id, kind, title)
--   select id, 'campaign_not_delivering', 'constraint check' from dealerships limit 1;
-- rollback;
--
-- AND nothing existing was disturbed. Expected: the same count as
-- before this ran.
--
-- select count(*) from notifications;
