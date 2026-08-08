-- Migration 080: RLS policies for the pricing/usage tables added in 079.
--
-- RLS got enabled on plan_limits / daily_message_usage / calling_minutes_usage
-- via the Supabase dashboard without any policies attached, which blocks
-- ALL reads for normal (non-service-role) clients — this is why the
-- /dashboard/billing/plans page rendered empty. Run this in the SQL Editor
-- to fix it.

-- plan_limits: just pricing/feature info, same for every business, no
-- per-row secrets — safe to let any authenticated user read all rows.
alter table plan_limits enable row level security;

create policy "plan_limits_read_all"
  on plan_limits for select
  to authenticated
  using (true);

-- daily_message_usage: scoped — a business should only ever see its own
-- usage row(s), never another dealership's.
alter table daily_message_usage enable row level security;

create policy "daily_message_usage_own_dealership"
  on daily_message_usage for select
  using (dealership_id in (select dealership_id from profiles where id = auth.uid()));

-- calling_minutes_usage: same scoping as above.
alter table calling_minutes_usage enable row level security;

create policy "calling_minutes_usage_own_dealership"
  on calling_minutes_usage for select
  using (dealership_id in (select dealership_id from profiles where id = auth.uid()));

-- Note: writes to daily_message_usage / calling_minutes_usage happen from
-- server-side API routes using the service-role client (createServiceClient),
-- which bypasses RLS entirely — so no insert/update policies are needed here.
-- If that ever changes to a client-side write, add explicit insert/update
-- policies scoped the same way as the select policies above.
