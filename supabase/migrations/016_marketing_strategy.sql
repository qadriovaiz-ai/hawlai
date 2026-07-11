-- ============================================================
-- Phase 2: Marketing Strategy — stores the latest generated roadmap
-- ============================================================
-- Revenue tracking (deal_value), CRM notes, and CRM tasks are
-- already covered by migration 015 — this only adds what's genuinely
-- new: the monthly strategy plan itself.

create table if not exists marketing_strategies (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  monthly_budget numeric,
  goal text,
  plan jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_marketing_strategies_dealership on marketing_strategies(dealership_id);

alter table marketing_strategies enable row level security;

create policy "marketing_strategies_dealership_all" on marketing_strategies
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
