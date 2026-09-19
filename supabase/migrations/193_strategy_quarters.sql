-- ============================================================
-- Advanced Strategy step 4: the next 90 days, week by week.
--
-- One row per plan. Code decides every week — its dates, the festival
-- whose campaign window it falls in (with the angle for how this business
-- makes money), or what to work on from the business's own diagnosis and
-- its positioning against real competitors. A model writes one idea per
-- week, each checked before it's kept (lib/strategy/calendar).
--
-- baseline holds the business's numbers when the quarter was planned, so
-- step 5 can measure the quarter against where it started.
--
-- Written by the server (service role); the owner reads their own.
-- ============================================================

create table if not exists strategy_quarters (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  weeks jsonb not null default '[]'::jsonb,
  baseline jsonb,
  -- What was dropped and why, where the diagnosis/positioning came from, an AI failure.
  notes jsonb not null default '{}'::jsonb,
  cost_inr numeric(10, 4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_strategy_quarters_dealership on strategy_quarters(dealership_id, created_at desc);

alter table strategy_quarters enable row level security;
drop policy if exists "strategy_quarters_owner_read" on strategy_quarters;
create policy "strategy_quarters_owner_read" on strategy_quarters
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
