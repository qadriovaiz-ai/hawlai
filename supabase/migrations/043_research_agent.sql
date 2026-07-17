-- AI Research Agent. Viral Content (Viral Trend Detection, Social
-- Media Management) and Competitor Reports (Competitor Intelligence)
-- already exist and aren't duplicated. This covers Industry Trends,
-- Market Research, New Opportunities (web-search-grounded), Customer
-- Sentiment (from real lead data, not web search), and News
-- Monitoring (a generic version of the competitor-watch pattern —
-- watch any topic, not just a named competitor).

create table if not exists research_items (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- 'industry_trends' | 'market_research' | 'new_opportunities' | 'customer_sentiment'
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists topic_watches (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  topic text not null,
  created_at timestamptz default now(),
  unique(dealership_id, topic)
);

create table if not exists topic_alerts (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  topic text not null,
  title text not null,
  summary text,
  source_url text,
  detected_at timestamptz default now()
);

create index if not exists idx_research_items_dealership_id on research_items(dealership_id);
create index if not exists idx_topic_watches_dealership_id on topic_watches(dealership_id);
create index if not exists idx_topic_alerts_dealership_id on topic_alerts(dealership_id);

alter table research_items enable row level security;
alter table topic_watches enable row level security;
alter table topic_alerts enable row level security;

create policy "research_items_dealership_all" on research_items
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "topic_watches_dealership_all" on topic_watches
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "topic_alerts_dealership_select" on topic_alerts
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
