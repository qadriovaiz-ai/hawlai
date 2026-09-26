-- ============================================================
-- The searches people really used to find this business
-- (Brain, Phase 4 step 2).
--
-- Migration 200 connected Search Console; this is where what it says
-- actually lands. One row per query per window, so a re-read of the same
-- window corrects itself instead of doubling every number.
--
-- WHY IT MATTERS MORE THAN IT LOOKS: until now every keyword Hawlai has
-- ever shown an owner was a model's guess — the SEO toolkit's own
-- instruction asks for "keywords competitors are PROBABLY ranking for".
-- These rows are Google's own count of impressions and clicks. It is the
-- first real search data in the product, and it is what turns the
-- Content Opportunity work from an opinion into arithmetic.
--
-- Google reports with roughly a two-day lag and only settles a few days
-- later, so windows here end several days back and are read with
-- dataState "final". A number that moves after the owner has seen it is
-- worse than a number that arrives late.
-- ============================================================

create table if not exists search_queries (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  -- Google's own figures, stored as given: ctr 0-1, position averaged.
  ctr numeric(6, 4) not null default 0,
  position numeric(6, 2) not null default 0,
  window_from date not null,
  window_to date not null,
  fetched_at timestamptz not null default now(),
  -- The same query in the same window is one row, corrected in place.
  unique (dealership_id, query, window_from, window_to)
);

create index if not exists idx_search_queries_window
  on search_queries(dealership_id, window_to desc, impressions desc);

alter table search_queries enable row level security;
drop policy if exists "search_queries_owner_read" on search_queries;
create policy "search_queries_owner_read" on search_queries
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
-- Written by the server only.
