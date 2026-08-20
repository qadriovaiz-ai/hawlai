-- ============================================================
-- Goal -> Plan -> Task System — P1 Wave 4 (8a)
-- ============================================================

create table if not exists goals (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  title text not null,
  description text,
  target_metric text,
  target_value numeric,
  deadline timestamptz,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  created_by text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_goals_dealership_status on goals(dealership_id, status);

alter table goals enable row level security;
create policy "goals_owner_all" on goals
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- agent_tasks.goal_id becomes a real FK — safe immediately since
-- agent_tasks is brand new (migration 130), zero existing rows to
-- violate it.
alter table agent_tasks add constraint agent_tasks_goal_id_fkey foreign key (goal_id) references goals(id) on delete set null;

-- tasks.goal_id deliberately stays an unconstrained loose tag — not
-- upgraded to a real FK here (confirmed decision), unlike
-- agent_tasks.goal_id above.
