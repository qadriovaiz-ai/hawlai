-- ============================================================
-- Master audit Part D — seasonality operationalization.
--
-- Seasonal/festival timing has only ever existed as advice text
-- (RAG knowledge entries, prompt instructions) — nothing actually
-- scheduled or triggered a campaign off a festival date.
-- marketing_calendar (migration 009) already models exactly this
-- ("Diwali social post — Oct 20" is its own example row in that
-- migration's header) but is read by no agent or cron; this
-- activates it rather than building a second, competing scheduler.
--
-- seasonal_events is platform-wide, not per-dealership — Diwali is
-- the same date for every business, so one shared read-only table
-- beats duplicating it per tenant.
--
-- Deliberately NOT seeded here. Indian festival dates move year to
-- year and guessing at them would be presenting a fabricated date as
-- fact — a separate step supplies verified dates before this table
-- gets any rows.
-- ============================================================

create table if not exists seasonal_events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  event_date date not null,
  region text,
  lead_time_days integer not null default 21,
  created_at timestamptz default now(),
  unique (name, event_date)
);

alter table seasonal_events enable row level security;
create policy "seasonal_events_read_all" on seasonal_events
  for select to authenticated using (true);

alter table dealerships add column if not exists seasonal_campaigns_enabled boolean not null default false;

alter table marketing_calendar add column if not exists seasonal_event_id uuid
  references seasonal_events(id) on delete set null;
create unique index if not exists idx_marketing_calendar_seasonal_unique
  on marketing_calendar(dealership_id, seasonal_event_id) where seasonal_event_id is not null;
