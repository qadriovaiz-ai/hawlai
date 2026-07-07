-- ============================================================
-- Paid Ads Agent — campaign tracking + scheduling
-- ============================================================
-- ad_creatives so far only stored the final ad_id. To let dealers
-- manage campaigns from the dashboard (activate/pause, see budget,
-- see if it's scheduled for later) we need the campaign and ad set
-- ids too, plus a local mirror of Meta's own status so the UI
-- doesn't have to hit the Graph API on every page load.

alter table ad_creatives add column if not exists meta_campaign_id text;
alter table ad_creatives add column if not exists meta_adset_id text;
alter table ad_creatives add column if not exists daily_budget numeric;
alter table ad_creatives add column if not exists targeting_city text;

-- Mirrors Meta's ACTIVE/PAUSED state for the ad. Kept in sync whenever
-- the dealer uses the Activate/Pause button on the Campaigns page.
alter table ad_creatives add column if not exists meta_status text default 'PAUSED';

-- If set, the ad set was created with this as its Meta start_time —
-- delivery won't begin until this moment even if the ad is Active.
alter table ad_creatives add column if not exists scheduled_start timestamptz;

create index if not exists idx_ad_creatives_status on ad_creatives(status);
