-- Research Credits — Usage/Pricing/Cost-Control spec, Phase 2 piece 1
-- (Section 7). "Do NOT permanently define 1 credit = X API tokens" —
-- credits are computed from real provider cost after each call
-- (src/lib/usage/researchCredits.ts), never a fixed token count.

alter table plan_limits add column if not exists research_credits_per_month integer;

update plan_limits set research_credits_per_month = case plan
  when 'free' then 10
  when 'basic' then 50
  when 'growth' then 100
  when 'pro' then 300
  when 'agency' then 1000
end;

-- Mirrors calling_minutes_usage's shape exactly (migration 079) — same
-- per-dealership-per-month rollup pattern already proven for calling.
create table if not exists research_credits_usage (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  billing_month date not null, -- first-of-month, same convention as calling_minutes_usage
  credits_used numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique(dealership_id, billing_month)
);

alter table research_credits_usage enable row level security;
create policy "research_credits_usage_own_dealership" on research_credits_usage
  for select using (dealership_id in (select dealership_id from profiles where id = auth.uid()));
-- No insert/update policy — writes only ever happen via the service-role
-- client from server-side research call sites, same as calling_minutes_usage.
