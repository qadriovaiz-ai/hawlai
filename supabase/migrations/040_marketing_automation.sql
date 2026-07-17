-- Marketing Automation — Workflow Builder. Generalizes the pattern
-- already used for auto welcome/follow-up emails into a dealer-
-- configurable system: pick a trigger, add ordered steps with a
-- delay each, each step sends an email (via the existing
-- EMAIL_TASKS generator or custom text). Runs on the same daily
-- autopilot cron as the rest of the automation — see
-- lib/automation/workflowEngine.ts.
--
-- Only email is a real automated action here (see whatsappMarketingAgent.ts
-- comments — WhatsApp automation needs the paid Business API, SMS
-- needs a paid gateway, neither is connected). This is stated plainly
-- in the UI rather than faking WhatsApp/SMS steps.

-- Calendar Sync — a private .ics feed of the dealership's appointments
-- that they can subscribe to in Google Calendar/Outlook/Apple
-- Calendar via "Add calendar by URL". Uses a separate random token
-- rather than the public booking_slug, since booking_slug is meant to
-- be shared publicly (guessable by design) while this feed exposes
-- appointment details and should stay private to the dealer.
alter table dealerships add column if not exists calendar_token text unique;

create table if not exists workflows (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  name text not null,
  trigger_type text not null, -- 'new_lead' | 'appointment_booked'
  status_filter text, -- optional: only fire for leads currently in this status
  enabled boolean default false,
  created_at timestamptz default now()
);

create table if not exists workflow_steps (
  id uuid primary key default uuid_generate_v4(),
  workflow_id uuid references workflows(id) on delete cascade not null,
  step_order integer not null default 0,
  delay_days integer not null default 0,
  email_task_type text, -- a key from EMAIL_TASKS, or 'custom'
  custom_subject text,
  custom_body text,
  created_at timestamptz default now()
);

create table if not exists workflow_step_runs (
  id uuid primary key default uuid_generate_v4(),
  workflow_id uuid references workflows(id) on delete cascade not null,
  step_id uuid references workflow_steps(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete cascade not null,
  sent_at timestamptz default now(),
  success boolean default true,
  error text,
  unique(step_id, lead_id)
);

create index if not exists idx_workflows_dealership_id on workflows(dealership_id);
create index if not exists idx_workflow_steps_workflow_id on workflow_steps(workflow_id);
create index if not exists idx_workflow_step_runs_workflow_id on workflow_step_runs(workflow_id);

alter table workflows enable row level security;
alter table workflow_steps enable row level security;
alter table workflow_step_runs enable row level security;

create policy "workflows_dealership_all" on workflows
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create policy "workflow_steps_dealership_all" on workflow_steps
  for all using (workflow_id in (select id from workflows where dealership_id in (select id from dealerships where owner_id = auth.uid())));

create policy "workflow_step_runs_dealership_select" on workflow_step_runs
  for select using (workflow_id in (select id from workflows where dealership_id in (select id from dealerships where owner_id = auth.uid())));
