-- 239: whether each integration WORKS, as opposed to whether it is stored.
--
-- H1 of docs/AUDIT-INTEGRATION-HEALTH.md, 27 November 2026. All seventeen
-- integrations decided "connected" from a stored value — an email, a page
-- id, a token, a URL. Search Console said Connected on a token dead for
-- 23 days; Instagram said connected on an invalidated token whose webhook
-- was never subscribed. This table holds what a real call last FOUND.
--
-- ONE ROW PER BUSINESS PER INTEGRATION. The primary key makes "which row
-- is current" a question nobody has to answer.
--
-- `integration` IS FREE TEXT, ON PURPOSE. The vocabulary is
-- src/lib/integrations/registry.ts, which moves faster than migrations
-- and is pinned by a test; a CHECK here would turn a new integration into
-- a failed insert in production — the same reasoning migration 209 gave
-- for action_levels.action_key.
--
-- `state` IS A CLOSED SET, because the screen and the notification both
-- branch on it, and a state they have never heard of would be drawn as
-- nothing. The same six words as src/lib/integrations/healthState.ts.
--
-- WRITTEN BY THE SERVER ONLY. Owners read their own rows; there is no
-- INSERT or UPDATE policy, so only the service client writes — the same
-- shape as event_queue (129). recordHealth reads the error of every write.
--
-- RUN BY HAND, as every migration here is.

create table if not exists integration_health (
  dealership_id uuid references dealerships(id) on delete cascade not null,
  integration text not null,
  state text not null check (state in ('working', 'needs_reconnect', 'not_responding', 'incomplete', 'unchecked', 'unverifiable')),
  -- The provider's own words, when it refused. "invalid_grant" or
  -- "session invalidated" is what tells the owner reconnecting is the fix.
  reason text,
  checked_at timestamptz not null default now(),
  -- When it last WORKED. Kept apart from checked_at so "broken since"
  -- is answerable without a history table.
  last_ok_at timestamptz,
  primary key (dealership_id, integration)
);

comment on table integration_health is
  'What a real call to each integration last found, per business. H1 of docs/AUDIT-INTEGRATION-HEALTH.md. Server-written only.';
comment on column integration_health.state is
  'working | needs_reconnect | not_responding | incomplete | unchecked | unverifiable — src/lib/integrations/healthState.ts.';

alter table integration_health enable row level security;
drop policy if exists "integration_health_owner_select" on integration_health;
create policy "integration_health_owner_select" on integration_health
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

-- ---- BEFORE RUNNING, two checks against the LIVE database -----------
--
-- 1. The table must not already exist under another shape:
--
--      select to_regclass('public.integration_health');
--
--    Expected: null.
--
-- 2. recordHealth raises the existing `integration_disconnected`
--    notification, added by migration 219. Confirm production allows it:
--
--      select pg_get_constraintdef(oid)
--      from pg_constraint
--      where conrelid = 'public.notifications'::regclass and contype = 'c'
--        and pg_get_constraintdef(oid) like '%kind%';
--
--    Expected: the list contains 'integration_disconnected'.
--
-- ---- VERIFY, after running ------------------------------------------
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'integration_health'
--   order by ordinal_position;
--
-- Expected: 6 rows — dealership_id uuid NO, integration text NO, state
-- text NO, reason text YES, checked_at timestamptz NO, last_ok_at
-- timestamptz YES.
--
--   select policyname, cmd from pg_policies where tablename = 'integration_health';
--
-- Expected: one row — integration_health_owner_select, SELECT. No INSERT.
