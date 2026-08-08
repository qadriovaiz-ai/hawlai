-- Influencer Outreach persistence — generateInfluencerPlan() (called
-- from both /api/influencer and Master Chat's generate_influencer_outreach
-- tool) previously returned its plan directly with no DB row at all, so
-- there was nothing to build the Edit+Save pattern on and no history.
-- This gives it the same shape every other AI-generation department
-- already has (id, dealership_id, input, output jsonb, created_at).

create table if not exists influencer_outreach_plans (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  product text not null,
  output jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_influencer_outreach_plans_dealership_id on influencer_outreach_plans(dealership_id);

alter table influencer_outreach_plans enable row level security;
drop policy if exists "influencer_outreach_plans_dealership_all" on influencer_outreach_plans;
create policy "influencer_outreach_plans_dealership_all" on influencer_outreach_plans
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
