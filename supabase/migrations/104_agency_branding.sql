-- ============================================================
-- Master audit Part E3 — White-labelling for reports.
--
-- Agency-level branding, keyed by owner_id — NOT dealership_id. This
-- is deliberately a different scope than brand_kits/brand_profiles
-- (which represent the branding of the client business being
-- reported ON). An agency account owns multiple dealerships and needs
-- ONE branding identity reused across all of them when exporting
-- reports to their own clients, so this table is additive and
-- separate rather than reusing either existing brand table.
-- ============================================================

create table if not exists agency_branding (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references auth.users(id) on delete cascade unique,
  logo_url text,
  primary_color text,
  agency_name text,
  hide_hawlai_branding boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table agency_branding enable row level security;
create policy "agency_branding_owner_all" on agency_branding
  for all using (owner_id = auth.uid());
