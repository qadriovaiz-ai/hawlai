-- ============================================================
-- Master audit Part D2 — Reputation/External Review Monitoring.
-- Dealer-pasted Google Place ID (same self-serve, no-OAuth trust
-- model as the existing Shopify/Slack integration fields — see
-- 024_integrations.sql) plus a daily snapshot table for the public
-- Places API (New) Place Details response, mirroring
-- campaign_performance_history's idempotent-by-day upsert shape.
-- ============================================================

alter table dealerships add column if not exists google_place_id text;

create table if not exists google_reviews_snapshot (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  snapshot_date date default current_date,
  rating numeric,
  review_count integer,
  recent_reviews jsonb default '[]'::jsonb,
  fetched_at timestamptz default now(),
  unique (dealership_id, snapshot_date)
);

alter table google_reviews_snapshot enable row level security;
create policy "google_reviews_snapshot_dealership_all" on google_reviews_snapshot
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
