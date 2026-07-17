-- Competitor Intelligence. Competitor Ads tracking already exists
-- (Research page, Meta Ad Library search) and isn't duplicated. This
-- covers the rest:
-- - competitor_intel_items: generated reports for social monitor,
--   pricing compare, SEO comparison, content gap — all use Claude's
--   web_search tool for genuinely current results, not fabricated data.
-- - competitor_watches + competitor_alerts: a REAL monitoring system
--   for "New Product Alerts" — the dealer adds a competitor to watch,
--   a daily cron job web-searches for recent news about them and
--   surfaces only genuinely new items (deduped against what's already
--   been seen), rather than faking an "alert" that's really just a
--   fresh search every time the page loads.

create table if not exists competitor_intel_items (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- 'social_media_monitor' | 'pricing_compare' | 'seo_comparison' | 'content_gap'
  competitor_name text not null,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists competitor_watches (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  competitor_name text not null,
  created_at timestamptz default now(),
  unique(dealership_id, competitor_name)
);

create table if not exists competitor_alerts (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  competitor_name text not null,
  title text not null,
  summary text,
  source_url text,
  detected_at timestamptz default now()
);

create index if not exists idx_competitor_intel_items_dealership_id on competitor_intel_items(dealership_id);
create index if not exists idx_competitor_watches_dealership_id on competitor_watches(dealership_id);
create index if not exists idx_competitor_alerts_dealership_id on competitor_alerts(dealership_id);

alter table competitor_intel_items enable row level security;
alter table competitor_watches enable row level security;
alter table competitor_alerts enable row level security;

create policy "competitor_intel_items_dealership_all" on competitor_intel_items
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "competitor_watches_dealership_all" on competitor_watches
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "competitor_alerts_dealership_select" on competitor_alerts
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
