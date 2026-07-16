-- Real email automation (not just content generation) — welcome
-- emails for new leads and follow-ups for leads gone quiet, sent
-- automatically with no human review, same opt-in-toggle-IS-approval
-- pattern as the DM/comment auto-reply feature. Runs once daily
-- piggybacking on the existing autopilot cron (api/autopilot/daily-run)
-- rather than a new Vercel cron entry — welcome emails may be sent up
-- to ~24h after the lead comes in rather than instantly; stated
-- plainly in the settings UI.

alter table dealerships add column if not exists welcome_email_auto_enabled boolean default false;
alter table dealerships add column if not exists follow_up_email_auto_enabled boolean default false;
alter table dealerships add column if not exists follow_up_inactive_days integer default 3;

alter table leads add column if not exists welcome_email_sent_at timestamptz;
alter table leads add column if not exists follow_up_email_sent_at timestamptz;

create table if not exists email_automation_log (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete set null,
  email_type text not null, -- 'welcome' | 'follow_up'
  recipient text,
  subject text,
  success boolean not null default true,
  error text,
  created_at timestamptz default now()
);

create index if not exists idx_email_automation_log_dealership_id on email_automation_log(dealership_id);

alter table email_automation_log enable row level security;

create policy "email_automation_log_dealership_select" on email_automation_log
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
