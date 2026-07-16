-- Paid Advertising planning toolkit for platforms not yet connected
-- (Google, LinkedIn, TikTok, Snapchat, Pinterest Ads). Meta Ads
-- already has a full real integration (Ads Manager, live launches,
-- budget, ROAS) and isn't duplicated here — this is AI-generated
-- planning content a dealer can use manually until each platform's
-- real API integration is approved and connected.

create table if not exists paid_ads_plans (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  platform text not null, -- 'google' | 'linkedin' | 'tiktok' | 'snapchat' | 'pinterest'
  task_type text not null, -- e.g. 'audience_research', 'ad_copy', 'pixel_setup'
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_paid_ads_plans_dealership_id on paid_ads_plans(dealership_id);

alter table paid_ads_plans enable row level security;

create policy "paid_ads_plans_dealership_all" on paid_ads_plans
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
