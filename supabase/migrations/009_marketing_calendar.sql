-- ============================================================
-- Marketing Calendar
-- ============================================================
-- Lets a dealer plan content/campaigns across channels ahead of
-- time — separate from ad_creatives (which only exists once an ad
-- has actually been generated/launched). This is the planning layer:
-- "Diwali social post — Oct 20" can sit here as an idea before any
-- agent has produced actual copy or creative for it.

create table if not exists marketing_calendar (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  title text not null,
  channel text default 'other' check (channel in ('paid_ads', 'social', 'email_whatsapp', 'seo', 'other')),
  scheduled_date date not null,
  status text default 'planned' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  notes text,

  created_at timestamptz default now()
);

create index if not exists idx_marketing_calendar_dealership_id on marketing_calendar(dealership_id);
create index if not exists idx_marketing_calendar_scheduled_date on marketing_calendar(scheduled_date);

alter table marketing_calendar enable row level security;

create policy "marketing_calendar_dealership_all" on marketing_calendar
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );
