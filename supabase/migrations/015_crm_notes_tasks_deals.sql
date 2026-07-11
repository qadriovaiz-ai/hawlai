-- ============================================================
-- CRM: Notes, Tasks, Deal Value (Phase 9 + Phase 14 support)
-- ============================================================

create table if not exists lead_notes (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  dealership_id uuid references dealerships(id) on delete cascade not null,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists lead_tasks (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  dealership_id uuid references dealerships(id) on delete cascade not null,
  title text not null,
  due_date date,
  status text default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz default now()
);

-- Actual sale value once a lead converts — needed for real ROAS
-- (revenue / spend), not just cost-per-lead.
alter table leads add column if not exists deal_value numeric;

create index if not exists idx_lead_notes_lead_id on lead_notes(lead_id);
create index if not exists idx_lead_tasks_lead_id on lead_tasks(lead_id);
create index if not exists idx_lead_tasks_status on lead_tasks(status);

alter table lead_notes enable row level security;
alter table lead_tasks enable row level security;

create policy "lead_notes_dealership_all" on lead_notes
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create policy "lead_tasks_dealership_all" on lead_tasks
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
