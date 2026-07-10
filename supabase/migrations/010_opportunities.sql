-- ============================================================
-- Opportunity Feed
-- ============================================================
-- The "push, not pull" pattern real AI marketing platforms use
-- (Madgicx's AI Marketer, AdCreative's Creative Insights): instead of
-- the dealer having to ask Master Brain what's wrong, the system
-- detects real issues from actual data and surfaces them as a
-- todo-style feed with a "Mark as done" action — reusable across
-- every agent, not tied to any one of them.

create table if not exists opportunities (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Machine-readable type so detection logic can find/update its own
  -- previously-created rows instead of duplicating them every run.
  type text not null,
  reference_id text not null default 'singleton',

  title text not null,
  description text,
  priority text default 'medium' check (priority in ('high', 'medium', 'low')),
  status text default 'open' check (status in ('open', 'completed', 'dismissed')),
  action_href text,

  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Prevents the same issue from being flagged twice while it's still open.
create unique index if not exists idx_opportunities_open_unique
  on opportunities(dealership_id, type, reference_id)
  where status = 'open';

create index if not exists idx_opportunities_dealership_status on opportunities(dealership_id, status);

alter table opportunities enable row level security;

create policy "opportunities_dealership_all" on opportunities
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );
