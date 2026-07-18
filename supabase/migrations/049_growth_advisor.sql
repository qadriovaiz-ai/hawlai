-- AI Growth Advisor. Business Health Score and Next Best Actions
-- already exist (growthAdvisorAgent.ts, shown on the Reports page) —
-- not duplicated. This adds Growth Opportunities, Revenue
-- Forecasting, Marketing Budget Recommendations, and Expansion
-- Strategy — all reasoning over REAL internal data (leads, campaign
-- performance, deal values), not web search and not invented numbers.
-- Distinct from AI Research Agent's "New Opportunities" (which is
-- external market research via web search) — Growth Opportunities
-- here looks at this business's own funnel/data for gaps.

create table if not exists growth_advisor_items (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- 'growth_opportunities' | 'revenue_forecast' | 'budget_recommendations' | 'expansion_strategy'
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_growth_advisor_items_dealership_id on growth_advisor_items(dealership_id);

alter table growth_advisor_items enable row level security;

create policy "growth_advisor_items_dealership_all" on growth_advisor_items
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
