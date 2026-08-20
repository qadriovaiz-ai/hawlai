-- ============================================================
-- Task/Work Queue — P1 Wave 3 (9a)
-- ============================================================
-- Deliberately a new table, not an extension of the existing `tasks`
-- table — tasks.assigned_to = null already means "the AI is doing
-- this itself, right now" (070_team_and_tasks.sql), which would
-- semantically collide with "queued for an AI to pick up later."
--
-- Mirrors pending_approvals' proven action_type/action_details shape
-- rather than inventing a new one.

create table if not exists agent_tasks (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Loose tag, same non-FK convention as tasks.goal_id — a real FK
  -- lands once Wave 4's `goals` table exists.
  goal_id uuid,

  -- Free text, same convention as pending_approvals.action_type — a
  -- new task type shouldn't need a migration to be queued.
  action_type text not null,
  action_details jsonb not null default '{}'::jsonb,
  title text not null,

  status text not null default 'pending' check (status in ('pending','processing','done','failed','cancelled')),
  attempts int not null default 0,
  error text,
  result jsonb,

  -- Supports "run this later," not just "run this now."
  scheduled_for timestamptz not null default now(),
  completed_at timestamptz,

  -- Free text, same convention as audit_log.actor — 'user:<uuid>',
  -- 'master_chat_tool:<name>', 'cron:<subsystem>'.
  created_by text not null,

  created_at timestamptz default now()
);

create index if not exists idx_agent_tasks_status_scheduled on agent_tasks(status, scheduled_for) where status = 'pending';
create index if not exists idx_agent_tasks_dealership on agent_tasks(dealership_id);

alter table agent_tasks enable row level security;

create policy "agent_tasks_owner_select" on agent_tasks
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
