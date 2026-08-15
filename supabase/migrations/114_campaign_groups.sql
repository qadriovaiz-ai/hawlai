-- ============================================================
-- Cross-channel orchestration, Phase A (master audit deferred Item 3).
-- Lets a dealer group existing assets from different channels
-- (a launched ad, a workflow, queued social posts) under one named
-- initiative and see a combined performance rollup — without
-- changing how any single channel's own system works.
--
-- Named "campaign_groups" rather than "campaigns" deliberately:
-- /dashboard/ads/campaigns already uses "campaign" to mean a single
-- launched ad_creatives row (Meta-ads-only). Reusing the word here
-- would collide with that existing meaning throughout the UI/code.
--
-- Phase A only groups assets that already exist — no scheduled or
-- triggered multi-channel launches yet (that's Phase B/C, deferred).
-- ============================================================

create table if not exists campaign_groups (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now()
);

-- asset_id is polymorphic (points into ad_creatives, workflows, or
-- social_post_queue depending on asset_type) — Postgres can't FK a
-- single column to three different tables, so ownership is validated
-- app-side (dealership-scoped lookup) before every insert here.
create table if not exists campaign_group_assets (
  id uuid primary key default uuid_generate_v4(),
  campaign_group_id uuid references campaign_groups(id) on delete cascade not null,
  dealership_id uuid references dealerships(id) on delete cascade not null,
  asset_type text not null check (asset_type in ('ad_creative', 'workflow', 'social_post')),
  asset_id uuid not null,
  created_at timestamptz default now()
);

create unique index if not exists idx_campaign_group_assets_unique on campaign_group_assets(campaign_group_id, asset_type, asset_id);
create index if not exists idx_campaign_group_assets_group on campaign_group_assets(campaign_group_id);

alter table campaign_groups enable row level security;
alter table campaign_group_assets enable row level security;

create policy "campaign_groups_dealership_all" on campaign_groups
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "campaign_group_assets_dealership_all" on campaign_group_assets
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
