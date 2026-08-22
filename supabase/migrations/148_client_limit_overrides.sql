-- Per-client limit overrides — Usage/Pricing/Cost-Control spec,
-- Phase 4 piece 2a (Enterprise usage controls).
--
-- REFRAMED from the spec's "per-department usage limits" after
-- verification: department-level caps would slice the same spend on a
-- less cost-relevant axis than the resource caps that ALREADY exist
-- (images/videos/voiceover, monthly AND daily, migrations 099 + 125).
-- The genuine gap for an agency operator is different: they resell
-- plans, and assigning a client the Pro tier grants that client Pro's
-- FULL allowance with no way to say "Pro's features, but only 10
-- videos". The agency absorbs the cost difference with no lever.
--
-- Note: team_members.feature_scope (migration 111) is unrelated — a
-- UI-visibility allow-list for ManagerWorkspace, not a usage limit.

create table if not exists client_limit_overrides (
  dealership_id uuid primary key references dealerships(id) on delete cascade,
  -- Each null = "no override, use the plan's own limit". Only ever
  -- applied when LOWER than the plan value (enforced in
  -- effectiveLimits.ts), so an override can never grant more than the
  -- plan actually sells — otherwise it becomes a way to quietly
  -- upsell around pricing.
  images_per_month integer,
  videos_per_month integer,
  voiceover_chars_per_month integer,
  research_credits_per_month integer,
  calling_minutes integer,
  messages_per_day integer,
  set_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table client_limit_overrides enable row level security;

-- Readable by the client business itself (confirmed decision: show
-- clients the truth — a plan-tier number they can't actually reach
-- would be a lie) and by the agency owner who set it.
create policy "client_limit_overrides_owner_select" on client_limit_overrides
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "client_limit_overrides_member_select" on client_limit_overrides
  for select using (dealership_id in (
    select dealership_id from team_members where user_id = auth.uid() and status = 'active'
  ));
-- No insert/update/delete policy — writes go through the service-role
-- client from the agency route, which verifies the caller actually
-- owns the target business first.
