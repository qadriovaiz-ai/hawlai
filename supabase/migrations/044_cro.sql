-- Conversion Rate Optimization. The existing CRO agent (api/cro, on
-- the SEO page) covers general ad-campaign conversion signals — this
-- covers the landing page specifically: Landing Page Optimization,
-- CTA Suggestions, Form Optimization, UX Suggestions (all AI-
-- generated using the real landing_pages content + real analytics
-- numbers from page_events, not guesses), and real A/B Testing
-- (headline/CTA variants actually served to visitors and measured).
-- Checkout Optimization: Hawlai has no e-commerce checkout flow — the
-- lead capture form IS the final conversion action here, so it's
-- covered by Form Optimization rather than building a fake checkout
-- system. Stated plainly in the UI.

create table if not exists cro_items (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- 'landing_page' | 'cta' | 'form' | 'ux'
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists ab_tests (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null unique,
  element text not null, -- 'headline' | 'cta'
  variant_a text not null,
  variant_b text not null,
  active boolean default false,
  created_at timestamptz default now()
);

-- Which A/B variant a given page_events row belongs to, so results
-- can be split by variant.
alter table page_events add column if not exists variant text;

create index if not exists idx_cro_items_dealership_id on cro_items(dealership_id);

alter table cro_items enable row level security;
alter table ab_tests enable row level security;

create policy "cro_items_dealership_all" on cro_items
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "ab_tests_dealership_all" on ab_tests
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
