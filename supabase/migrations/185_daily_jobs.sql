-- ============================================================
-- The daily job list: one row per business per automation per day,
-- worked through by invocations that hand over to a fresh one.
--
-- WHY: a daily cron invocation gets 60 seconds on Vercel Hobby and ran
-- every automation for every business inside them. candle_by_qaaf's
-- welcome emails ran on 10 Sep and then not once on 11–15 Sep — the
-- invocation was killed before reaching it, and a killed invocation
-- logs nothing. Now the 8:30 and 9:00 crons write today's list and
-- start working; each invocation takes jobs one at a time (a
-- conditional claim, so two never run the same job), starts another
-- invocation to carry on, and stops taking new jobs well before 60s.
-- A job whose invocation was killed is put back and retried (3 attempts),
-- then marked failed with the reason — visible on the health card.
-- Written only by the server (service role); owners can read their own.
-- ============================================================

create table if not exists daily_jobs (
  id uuid primary key default uuid_generate_v4(),
  run_date date not null,
  run_group text not null check (run_group in ('signals', 'heavy')),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  subsystem text not null,
  position integer not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (run_date, dealership_id, subsystem)
);

create index if not exists idx_daily_jobs_queue on daily_jobs(run_date, run_group, status, position);
create index if not exists idx_daily_jobs_dealership on daily_jobs(dealership_id, run_date);

alter table daily_jobs enable row level security;
drop policy if exists "daily_jobs_owner_read" on daily_jobs;
create policy "daily_jobs_owner_read" on daily_jobs
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
