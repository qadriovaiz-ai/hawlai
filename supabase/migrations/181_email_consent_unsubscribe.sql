-- ============================================================
-- Marketing email: a business address for the footer, a working
-- unsubscribe, and a suppression list every marketing send checks.
--
-- Approved 2026-09-14:
--   - no business address → no marketing email (it goes in every footer);
--   - chat emails only people on record, checked against suppressions;
--   - CSV lead uploads confirm where consent came from (uses the consent
--     columns migration 101 added to leads — re-declared below as
--     no-ops in case 101 never reached this database).
--
-- email_suppressions: one row per business + address that must not get
-- marketing email again — unsubscribed now; bounced/complained later
-- from Resend's webhook. Emails stored lower-cased. Written only by the
-- server (service role); owners can read their own.
--
-- email_unsubscribe_tokens: a random token per marketing email, created
-- before it's sent, so the unsubscribe link needs no secret and reveals
-- nothing. Service role only.
-- ============================================================

alter table dealerships add column if not exists business_address text;

create table if not exists email_suppressions (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('unsubscribed', 'bounced', 'complained', 'manual')),
  source text,
  created_at timestamptz not null default now(),
  unique (dealership_id, email)
);
create index if not exists idx_email_suppressions_dealership on email_suppressions(dealership_id);
alter table email_suppressions enable row level security;
drop policy if exists "email_suppressions_owner_read" on email_suppressions;
create policy "email_suppressions_owner_read" on email_suppressions
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create table if not exists email_unsubscribe_tokens (
  token text primary key,
  dealership_id uuid not null references dealerships(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table email_unsubscribe_tokens enable row level security;

alter table leads add column if not exists dnd_opt_out boolean not null default false;
alter table leads add column if not exists dnd_opt_out_at timestamptz;
alter table leads add column if not exists dnd_opt_out_source text;
alter table leads add column if not exists consent_status text not null default 'unknown';
alter table leads add column if not exists consent_captured_at timestamptz;
alter table leads add column if not exists consent_source text;
