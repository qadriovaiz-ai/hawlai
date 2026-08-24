-- Analytics date-range indexes.
--
-- Indexes only — no schema change, no new data collected.
--
-- Needed because the analytics page is gaining real date filtering.
-- Before this it fetched every row unbounded (select("*") with no
-- date predicate), so there was nothing to index for. Adding .gte()/
-- .lte() without these would make the page SLOWER at scale rather
-- than faster: Postgres would scan the full dealership partition and
-- then discard by date.
--
-- campaign_performance_history already had an index on dealership_id
-- alone (migration 021) and one on (ad_creative_id, snapshot_date) —
-- neither serves "this dealership, within this date range", which is
-- the query the date picker actually issues.

create index if not exists idx_campaign_perf_history_dealership_date
  on campaign_performance_history(dealership_id, snapshot_date desc);

create index if not exists idx_leads_dealership_created
  on leads(dealership_id, created_at desc);

create index if not exists idx_calls_dealership_created
  on calls(dealership_id, created_at desc);

create index if not exists idx_appointments_dealership_created
  on appointments(dealership_id, created_at desc);
