-- Team feature — lets an Owner invite people into scoped roles, and
-- lets the AI auto-assign work to them instead of doing everything
-- itself. Deliberately does NOT touch any of the ~54 existing RLS
-- policies (all hardcoded to `dealerships.owner_id = auth.uid()`,
-- across nearly every table in the app) — rewriting that many
-- policies in one pass is too risky to do safely right now. Instead:
-- the Owner's experience is completely unchanged (still the RLS-
-- protected user client everywhere), and team-member-facing pages
-- (Task Inbox, the Team page) use the service-role client with an
-- explicit, manual "is this an active team member of this dealership"
-- check in the API route itself. Real access control, just enforced
-- in application code for this one new surface instead of at the
-- database layer — a deliberate, scoped choice, not an oversight.

create table if not exists team_members (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade, -- null until the invite is accepted
  email text not null,
  role text not null default 'viewer', -- 'admin' | 'marketing_manager' | 'designer' | 'content_writer' | 'sales' | 'viewer' (owner is the dealership itself, not a team_members row)
  status text default 'invited', -- 'invited' | 'active' | 'removed'
  invite_token text unique,
  invited_by uuid references auth.users(id),
  invited_at timestamptz default now(),
  joined_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_team_members_dealership_id on team_members(dealership_id);
create index if not exists idx_team_members_user_id on team_members(user_id);
create index if not exists idx_team_members_invite_token on team_members(invite_token);

alter table team_members enable row level security;

-- Owner (and anyone whose own auth.uid() the invite already resolved
-- to) can see the roster — this one stays on the standard owner_id
-- pattern since only the Owner manages the Team page.
drop policy if exists "team_members_owner_all" on team_members;
create policy "team_members_owner_all" on team_members
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- A team member can see their own row (needed so a just-accepted
-- member's own client can confirm their membership/role).
drop policy if exists "team_members_self_read" on team_members;
create policy "team_members_self_read" on team_members
  for select using (user_id = auth.uid());

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  goal_id uuid, -- loosely groups tasks created from the same Master Chat request; no FK, just a shared uuid tag

  title text not null,
  brief text, -- the plain-language instruction the AI wrote for whoever does this
  department text, -- which department this task belongs to, e.g. 'graphic_design', 'content_marketing', 'sales'
  context jsonb default '{}'::jsonb, -- structured context (e.g. brand colors, product info) so the assignee doesn't have to ask

  assigned_to uuid references team_members(id) on delete set null, -- null = AI is doing it itself, not a human
  assigned_role text, -- the role this task is suited for, even before/if a specific person is matched
  created_by uuid references auth.users(id),

  status text default 'open', -- 'open' | 'in_progress' | 'done' | 'cancelled'
  due_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tasks_dealership_id on tasks(dealership_id);
create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_tasks_goal_id on tasks(goal_id);

alter table tasks enable row level security;

drop policy if exists "tasks_owner_all" on tasks;
create policy "tasks_owner_all" on tasks
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop trigger if exists on_tasks_update on tasks;
create trigger on_tasks_update
  before update on tasks
  for each row execute procedure public.set_ecommerce_updated_at();
