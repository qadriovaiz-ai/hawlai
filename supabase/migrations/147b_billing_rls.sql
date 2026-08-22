-- RLS for the billing tables created in 147.
--
-- Closes a real gap: 147's proposal contained only CREATE TABLE
-- statements, so billing_profiles / invoices / billing_events were
-- created with RLS DISABLED — readable and writable by any
-- authenticated user, in tables holding legal names, GSTINs and
-- revenue. Caught immediately after 147 was run, before any code
-- touched these tables.

alter table billing_profiles enable row level security;
alter table invoices enable row level security;
alter table billing_events enable row level security;

-- Owner can see their own billing identity/invoices/events. No
-- insert/update/delete policy anywhere on purpose — every write goes
-- through the service-role client from admin-only server routes, so a
-- business can never self-issue, alter, or void its own invoice.
create policy "billing_profiles_owner_select" on billing_profiles
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "invoices_owner_select" on invoices
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
create policy "billing_events_owner_select" on billing_events
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- Platform admin sees every business's billing data — this is
-- Hawlai's own revenue bookkeeping.
create policy "billing_profiles_admin_select" on billing_profiles
  for select using (exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true));
create policy "invoices_admin_select" on invoices
  for select using (exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true));
create policy "billing_events_admin_select" on billing_events
  for select using (exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true));

create index if not exists idx_invoices_dealership on invoices(dealership_id, created_at desc);
create index if not exists idx_billing_events_dealership on billing_events(dealership_id, created_at desc);
