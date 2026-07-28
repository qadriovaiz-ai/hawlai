-- Team feature, next slice: Sales gets real lead assignment, not just
-- generic tasks-about-leads. Flagged as explicit follow-up in
-- migration 071's own comments — this closes that gap.

alter table leads add column if not exists assigned_to uuid references team_members(id) on delete set null;
create index if not exists idx_leads_assigned_to on leads(assigned_to);

-- Sales sees/updates ONLY leads assigned to them — deliberately
-- narrower than the admin/marketing_manager full-CRM policy from
-- migration 071 (which stays unchanged; a lead visible to Sales via
-- this policy is also visible to Admin/Marketing Manager via that
-- one — the two policies are independent grants, not competing).
create or replace function public.is_assigned_sales_rep(lead_assigned_to uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from team_members
    where id = lead_assigned_to
      and user_id = auth.uid()
      and status = 'active'
      and role = 'sales'
  );
$$;

drop policy if exists "leads_team_sales_assigned" on leads;
create policy "leads_team_sales_assigned" on leads
  for all using (public.is_assigned_sales_rep(assigned_to));
