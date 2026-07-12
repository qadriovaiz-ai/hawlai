-- ============================================================
-- Campaign Performance History — permanent record, independent of Meta
-- ============================================================
-- Right now every Analytics/Campaigns view fetches spend/leads LIVE
-- from Meta's Insights API each time — nothing is stored permanently
-- in our own database. That works fine while everything is connected
-- and Meta keeps the data, but if Meta access is ever lost, an ad
-- account changes, or a campaign gets deleted, that historical
-- performance record is gone with it, since we never made our own
-- copy. This adds a daily snapshot so past performance survives
-- independent of Meta.

create table if not exists campaign_performance_history (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  ad_creative_id uuid references ad_creatives(id) on delete cascade not null,

  snapshot_date date not null default current_date,
  headline text,
  spend numeric default 0,
  impressions integer default 0,
  clicks integer default 0,
  leads integer default 0,
  cost_per_lead numeric,

  created_at timestamptz default now()
);

-- One snapshot per campaign per day — re-running the cron the same
-- day updates today's row instead of creating duplicates.
create unique index if not exists idx_campaign_perf_history_unique
  on campaign_performance_history(ad_creative_id, snapshot_date);

create index if not exists idx_campaign_perf_history_dealership on campaign_performance_history(dealership_id);

alter table campaign_performance_history enable row level security;

create policy "campaign_performance_history_dealership_all" on campaign_performance_history
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
