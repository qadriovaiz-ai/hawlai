-- ============================================================
-- Advanced Strategy step 3: positioning against what competitors
-- actually say in public.
--
-- WHY (approved 2026-09-19): Meta's Ad Library API returns only
-- political/issue ads outside the EU — the live check on the Research
-- page answered "Application does not have permission for this action".
-- Competitor messaging now comes from their public pages (read by web
-- search, every claim kept with the exact quoted snippet and link) and
-- from ads the owner pastes in themselves.
--
--   competitor_positioning  one row per run: the competitors, every
--                           sourced claim, and the analysis. Written by
--                           the server; the owner reads their own.
--   competitor_owner_ads    ad text the owner saw and pasted in — a
--                           source that outlives any one run.
--   competitor_dismissed    competitors Hawlai found that the owner
--                           removed, so they're never found again.
-- ============================================================

create table if not exists competitor_positioning (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  -- A run is two requests (each must fit Vercel's 60 seconds): collecting
  -- the claims, then analysing them.
  status text not null default 'collected' check (status in ('collected', 'analysed')),
  competitors jsonb not null default '[]'::jsonb,
  claims jsonb not null default '[]'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_competitor_positioning_dealership on competitor_positioning(dealership_id, created_at desc);

create table if not exists competitor_owner_ads (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  competitor_name text not null,
  ad_text text not null check (char_length(ad_text) between 10 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_competitor_owner_ads_dealership on competitor_owner_ads(dealership_id);

create table if not exists competitor_dismissed (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  competitor_name text not null,
  created_at timestamptz not null default now(),
  unique (dealership_id, competitor_name)
);

alter table competitor_positioning enable row level security;
drop policy if exists "competitor_positioning_owner_read" on competitor_positioning;
create policy "competitor_positioning_owner_read" on competitor_positioning
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

alter table competitor_owner_ads enable row level security;
drop policy if exists "competitor_owner_ads_owner_all" on competitor_owner_ads;
create policy "competitor_owner_ads_owner_all" on competitor_owner_ads
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()))
  with check (dealership_id in (select id from dealerships where owner_id = auth.uid()));

alter table competitor_dismissed enable row level security;
drop policy if exists "competitor_dismissed_owner_all" on competitor_dismissed;
create policy "competitor_dismissed_owner_all" on competitor_dismissed
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()))
  with check (dealership_id in (select id from dealerships where owner_id = auth.uid()));
