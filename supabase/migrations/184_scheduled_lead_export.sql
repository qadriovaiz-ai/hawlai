-- ============================================================
-- Scheduled leads export: "send me my leads CSV every week/month".
--
-- Approved 2026-09-16: emailed as a sign-in download link (no lead data
-- in the email), the full list every time with how many are new, to the
-- business owner's login email only, set by the owner or an admin.
--
-- lead_export_log: one row per scheduled export attempt — what the
-- health card reads ("Last sent 1 Sep · 42 leads"), and where a failure
-- is recorded instead of disappearing.
-- ============================================================

alter table dealerships add column if not exists lead_export_frequency text not null default 'off';
alter table dealerships drop constraint if exists dealerships_lead_export_frequency_check;
alter table dealerships add constraint dealerships_lead_export_frequency_check
  check (lead_export_frequency in ('off', 'weekly', 'monthly'));
alter table dealerships add column if not exists lead_export_last_sent_at timestamptz;

create table if not exists lead_export_log (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  frequency text not null,
  recipient text,
  row_count integer,
  new_count integer,
  success boolean not null,
  error text,
  resend_message_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_export_log_dealership on lead_export_log(dealership_id, created_at desc);
alter table lead_export_log enable row level security;
drop policy if exists "lead_export_log_owner_read" on lead_export_log;
create policy "lead_export_log_owner_read" on lead_export_log
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
