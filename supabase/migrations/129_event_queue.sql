-- ============================================================
-- Event Bus foundation — P1 Wave 2 decision
-- ============================================================
-- Postgres-native outbox table + polling dispatcher, deliberately not
-- LISTEN/NOTIFY or Supabase Realtime — both want a persistent
-- connection to receive events, and this app is 100% serverless
-- (Vercel functions per-request) with zero long-running processes
-- anywhere. pg_cron (this file) + pg_net (a separate, NOT-committed
-- manual step — it embeds the dispatch secret, which must never sit
-- in git) fires a frequent poll instead. This same pg_cron schedule
-- is the shared frequent trigger the Task Queue (P1 Wave 3) will also
-- use, once it exists — no second cron job needed.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists event_queue (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts int not null default 0,
  error text,
  processed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_event_queue_status_created on event_queue(status, created_at) where status = 'pending';
create index if not exists idx_event_queue_dealership on event_queue(dealership_id);

alter table event_queue enable row level security;

-- Owner can read (future activity view) — INSERT/UPDATE only ever via
-- the service-role client from trusted server code (emitEvent()
-- helper, the dispatch route), same trust model as automation_run_log/
-- audit_log. No client insert policy.
create policy "event_queue_owner_select" on event_queue
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

-- ============================================================
-- Run separately in the Supabase SQL editor (NOT part of this file —
-- embeds the dispatch secret, kept out of git):
--
-- select vault.create_secret('<CRON_SECRET value>', 'cron_dispatch_secret');
-- select cron.schedule(
--   'dispatch-event-queue',
--   '*/2 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://hawlai.vercel.app/api/events/dispatch',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_dispatch_secret')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- ============================================================
