-- P3 Security fix — the 2 tables with no RLS at all — a previously-
-- documented, deliberate tradeoff (docs/DATABASE.md), not a silent
-- miss, but cheap to close for defense-in-depth: the service-role-
-- only-write assumption already holds today, but shouldn't be the
-- only thing standing between this data and a cross-tenant read.

-- monthly_generation_usage was missing the FK constraint every
-- sibling table has (daily_generation_usage already has it) — small,
-- clearly correct addition alongside the RLS fix, same table.
alter table monthly_generation_usage add constraint monthly_generation_usage_dealership_id_fkey
  foreign key (dealership_id) references dealerships(id) on delete cascade;

alter table monthly_generation_usage enable row level security;
alter table daily_generation_usage enable row level security;

create policy "monthly_generation_usage_owner_select" on monthly_generation_usage
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create policy "daily_generation_usage_owner_select" on daily_generation_usage
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
