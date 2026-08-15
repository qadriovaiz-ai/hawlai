-- ============================================================
-- Fixes infinite RLS recursion on dealerships (Postgres error 42P17,
-- "infinite recursion detected in policy for relation dealerships").
--
-- Root cause: two policies form a cycle across two tables.
--   - dealerships_team_read (migration 071) subqueries team_members
--     directly: id in (select dealership_id from team_members where ...).
--   - team_members_owner_all (migration 070) subqueries dealerships
--     directly: dealership_id in (select id from dealerships where
--     owner_id = auth.uid()).
-- Evaluating dealerships' RLS requires checking team_members' RLS,
-- which requires checking dealerships' RLS again, looping until
-- Postgres's recursion guard aborts the query. This has been latent
-- since migration 071 first ran; whether a given query trips it
-- depends on the query plan Postgres chooses (a direct query on
-- dealerships hit it in production; an embedded profiles->dealerships
-- join apparently didn't, purely by chance of plan shape).
--
-- Fix: route dealerships_team_read's team-membership check through a
-- SECURITY DEFINER function, the exact pattern migration 071 already
-- established for is_admin_or_marketing_manager() and migration 105
-- already relies on safely elsewhere. A security definer function
-- owned by the same role that owns these tables runs with that
-- owner's privileges, and table owners bypass RLS on their own tables
-- by default (no FORCE ROW LEVEL SECURITY is set anywhere in this
-- schema) — so the function's internal read of team_members never
-- re-enters RLS, breaking the cycle at this one link. Only this side
-- needs fixing: once dealerships' policy no longer loops back into
-- team_members via RLS, a query on team_members checking dealerships
-- terminates after one hop, same as before.
--
-- Access control is unchanged — same set of dealership rows becomes
-- visible to the same set of users (any active team_members row,
-- any role), just computed via a function call instead of an inline
-- subquery.
-- ============================================================

create or replace function public.is_active_team_member(target_dealership_id uuid)
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
  );
$$;

drop policy if exists "dealerships_team_read" on dealerships;
create policy "dealerships_team_read" on dealerships
  for select using (
    public.is_active_team_member(id)
  );
