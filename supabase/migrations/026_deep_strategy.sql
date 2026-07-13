-- ============================================================
-- Deep Strategy — save it once, don't regenerate every page visit
-- ============================================================
-- Ovaiz's real UX complaint: the Full Strategic Analysis re-ran a
-- fresh (slow, costs a Claude call every time) generation on every
-- open/close of the panel instead of saving the result once, same
-- as the monthly roadmap already does.

create table if not exists deep_strategies (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null unique,
  strategy jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_deep_strategies_dealership on deep_strategies(dealership_id);

alter table deep_strategies enable row level security;

create policy "deep_strategies_dealership_all" on deep_strategies
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
