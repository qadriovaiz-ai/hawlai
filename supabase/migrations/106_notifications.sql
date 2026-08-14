-- ============================================================
-- Master audit Part D — in-app notification centre.
--
-- Four kinds of proactive signal already get detected and persisted
-- today, but none of them has an in-app home: competitor alerts and
-- topic alerts are buried inside their own department tabs, an
-- auto-paused campaign is only discoverable by opening the approvals
-- queue, and the hot-lead Slack ping persists no in-app record at
-- all. Meanwhile the TopBar bell has never had a click handler and
-- renders a permanently-hardcoded unread dot.
--
-- This is a sink, not new detection — every emit point already
-- exists and is already centralised in the daily cron.
-- ============================================================

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  kind text not null check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending'
  )),
  title text not null,
  body text,
  href text,
  -- Stable per-source identifier so a re-run or retried cron step
  -- updates nothing rather than emitting a duplicate. Duplicate
  -- notifications are the classic way this kind of feature decays
  -- into noise people stop reading.
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_dealership
  on notifications(dealership_id, created_at desc);
create unique index if not exists idx_notifications_dedupe
  on notifications(dealership_id, dedupe_key) where dedupe_key is not null;

alter table notifications enable row level security;
create policy "notifications_dealership_all" on notifications
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
