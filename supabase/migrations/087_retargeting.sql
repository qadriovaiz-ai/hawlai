-- Migration 087: Retargeting — ad copy generated per real audience
-- segment (abandoned cart / cold lead / lapsed buyer), editable and
-- saved like every other generate_* department.

create table if not exists retargeting_campaigns (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  segment_type text not null check (segment_type in ('abandoned_cart', 'cold_lead', 'lapsed_buyer')),
  output jsonb not null default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_retargeting_campaigns_dealership_id on retargeting_campaigns(dealership_id);

alter table retargeting_campaigns enable row level security;

create policy "retargeting_campaigns_dealership_all" on retargeting_campaigns
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
