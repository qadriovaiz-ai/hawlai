-- Migration 126: automation_run_log — P0 12c (Automation Command
-- Center). No unified per-automation run history existed anywhere —
-- only 3 of the app's 13 daily cron subsystems (content_autopilot_log,
-- auto_reply_log, email_automation_log) had any log at all, each with
-- a different shape. This is one generic table for all 13, layered
-- alongside those 3 existing tables (not replacing them — they keep
-- their own finer per-item detail), so "last run"/"success rate" can
-- exist uniformly across every subsystem, not just the 3 that already
-- happened to have logging.

create table if not exists automation_run_log (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  subsystem text not null,
  success boolean not null,
  detail text,          -- truncated result summary on success, error message on failure
  duration_ms integer,
  created_at timestamptz default now()
);

create index if not exists idx_automation_run_log_dealership on automation_run_log(dealership_id, subsystem, created_at desc);

alter table automation_run_log enable row level security;

create policy "automation_run_log_dealership_all" on automation_run_log
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
