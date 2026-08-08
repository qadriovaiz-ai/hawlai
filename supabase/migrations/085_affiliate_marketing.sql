-- Migration 085: Affiliate Marketing — ongoing commission relationships,
-- distinct from Influencer Marketing's one-off collabs. Reuses the
-- discount_codes + orders attribution pattern already proven there.

create table if not exists affiliates (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  name text not null,
  email text,
  phone text,
  notes text, -- audience/platform info from their application, or dealer notes

  discount_code text, -- links to a real discount_codes row for attribution
  commission_type text default 'percentage' check (commission_type in ('percentage', 'fixed')),
  commission_rate numeric(6,2) default 10, -- percent, or flat rupees per order, per commission_type

  status text default 'pending' check (status in ('pending', 'active', 'paused', 'rejected')),
  total_paid numeric(10,2) default 0, -- dealer-tracked payouts made so far

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_affiliates_dealership_id on affiliates(dealership_id);
create index if not exists idx_affiliates_discount_code on affiliates(dealership_id, discount_code);

alter table affiliates enable row level security;

create policy "affiliates_dealership_all" on affiliates
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create or replace function public.set_affiliates_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_affiliates_update on affiliates;
create trigger on_affiliates_update
  before update on affiliates
  for each row execute procedure public.set_affiliates_updated_at();
