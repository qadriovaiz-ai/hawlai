-- Platform-wide daily spend alert — Usage/Pricing/Cost-Control spec,
-- Phase 3b (replacing the spec's literal CostGuard, by confirmed
-- decision).
--
-- Why not the spec's CostGuard: every genuinely expensive operation
-- in this app is ALREADY hard-capped before execution (video has
-- monthly AND daily caps from P0 migration 125; images/voiceover/
-- brand kits/websites have monthly caps; research credits and Master
-- Chat messages hard-block). A per-request cost-estimate-and-confirm
-- layer would have duplicated protection that already exists. What
-- per-request caps structurally CANNOT catch is aggregate runaway
-- spend across all businesses at once — that's what this adds.

-- Platform-wide operator settings. Deliberately a tiny key-value
-- table rather than an env var: consistent with plan_limits (tunable
-- without a redeploy), and this won't be the only platform-level
-- setting forever.
create table if not exists platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ₹2,000/day is a PLACEHOLDER, not a derived number — with no paying
-- customers yet, real daily spend is near zero, so any threshold is a
-- guess. It lives in the DB precisely so it can be tuned once real
-- usage exists.
insert into platform_settings (key, value)
  values ('daily_spend_alert_inr', '2000')
on conflict (key) do nothing;

alter table platform_settings enable row level security;
-- Platform-internal, never customer-facing (Section 16). Admin read
-- only; writes go through the service-role client.
create policy "platform_settings_admin_select" on platform_settings
  for select using (
    exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  );

-- Same extend-the-constraint pattern as 109/110/115/121/122/124/132/135/136.
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
    'goal_completed','goal_task_failed',
    'lead_merge_needs_review',
    'platform_spend_alert'
  ));
