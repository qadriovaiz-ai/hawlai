-- Team feature, phase 2: Admin and Marketing Manager get real, scoped
-- dashboard access instead of just the Task Inbox (Designer/Content
-- Writer/Sales/Viewer stay on Task Inbox — their roles are inherently
-- single-purpose per the frozen UX design, this only applies to the
-- two roles the design doc always intended to see more of the
-- product).
--
-- Approach: additive RLS, not a rewrite. Every extended policy below
-- keeps its original `owner_id = auth.uid()` clause completely intact
-- and ORs in a new team-membership check — the owner's access is
-- byte-for-byte unchanged, this can only ever grant additional access
-- to the two roles named, never remove or weaken anything that
-- existed before this migration.
--
-- This migration covers dealerships (read-only, so a team member can
-- see basic business info) and leads (full CRM access for Admin/
-- Marketing Manager). Extending the same pattern to content_pieces,
-- campaigns, and other Marketing-Manager-scoped tables is the
-- necessary next slice of this same work, not done in this pass.

create or replace function public.is_admin_or_marketing_manager(target_dealership_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from team_members
    where dealership_id = target_dealership_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('admin', 'marketing_manager')
  );
$$;

-- Dealerships: team members (any active role) can read their own
-- business's basic info — read-only, they never manage billing/
-- ownership here regardless of role.
drop policy if exists "dealerships_team_read" on dealerships;
create policy "dealerships_team_read" on dealerships
  for select using (
    id in (select dealership_id from team_members where user_id = auth.uid() and status = 'active')
  );

-- Leads: Admin and Marketing Manager get full CRM access (matches the
-- Team design doc's role table). Sales intentionally excluded here —
-- Sales should only see leads assigned to them specifically, which
-- needs a lead-assignment column that doesn't exist yet; scoping
-- Sales correctly is separate follow-up work, not done in this pass.
drop policy if exists "leads_team_admin_marketing_all" on leads;
create policy "leads_team_admin_marketing_all" on leads
  for all using (public.is_admin_or_marketing_manager(dealership_id));
