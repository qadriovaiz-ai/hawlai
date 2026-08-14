-- ============================================================
-- Master audit Part E5 — fixes an accidental RLS over-grant.
--
-- ad_creatives, daily_message_usage and calling_minutes_usage all
-- key their policies off `profiles.dealership_id` rather than
-- `dealerships.owner_id`. Since /api/team/accept sets
-- profiles.dealership_id on every invite acceptance, this silently
-- granted EVERY team member — including `viewer`, the most
-- restricted role — read/insert/update on ad_creatives. And because
-- removing a team member only sets team_members.status = 'removed'
-- without clearing profiles.dealership_id, a removed member kept
-- that access indefinitely.
--
-- The comment at src/app/api/team/accept/route.ts:33-37 claimed this
-- profiles write was "not as an RLS grant ... not a security
-- boundary." That was true of every other table in the schema, but
-- not of these three.
--
-- Fix: repoint them onto the same two predicates the rest of the
-- schema uses — the real owner, OR (for ad_creatives only) an active
-- Admin/Marketing Manager via the existing
-- public.is_admin_or_marketing_manager() helper from migration 071.
-- Both predicates check live state, so a removed member loses access
-- immediately regardless of what profiles.dealership_id still says.
--
-- Usage/billing tables stay owner-only, matching migration 071's
-- stated intent that team members "never manage billing/ownership
-- here regardless of role."
--
-- Note for owners: these policies previously resolved through
-- profiles.dealership_id, i.e. only the CURRENTLY ACTIVE business.
-- Scoping by owner_id instead means a multi-business owner can now
-- read all of their own businesses' rows, consistent with how every
-- other owner policy in the schema already behaves.
-- ============================================================

-- ---------- ad_creatives ----------
drop policy if exists "Users view own dealership ad creatives" on ad_creatives;
drop policy if exists "Users insert own dealership ad creatives" on ad_creatives;
drop policy if exists "Users update own dealership ad creatives" on ad_creatives;

create policy "ad_creatives_owner_or_manager_select" on ad_creatives
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
    or public.is_admin_or_marketing_manager(dealership_id)
  );

create policy "ad_creatives_owner_or_manager_insert" on ad_creatives
  for insert with check (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
    or public.is_admin_or_marketing_manager(dealership_id)
  );

create policy "ad_creatives_owner_or_manager_update" on ad_creatives
  for update using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
    or public.is_admin_or_marketing_manager(dealership_id)
  );

-- ---------- usage / billing tables (owner-only) ----------
drop policy if exists "daily_message_usage_own_dealership" on daily_message_usage;
create policy "daily_message_usage_own_dealership" on daily_message_usage
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

drop policy if exists "calling_minutes_usage_own_dealership" on calling_minutes_usage;
create policy "calling_minutes_usage_own_dealership" on calling_minutes_usage
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
