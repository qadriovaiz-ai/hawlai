-- Offers / Discount Codes — real coupon codes the owner creates and
-- manages, applied at checkout. Server always re-validates and
-- recomputes the discount at order time (never trusts a client-sent
-- discount amount), same principle as price re-validation in
-- /api/public/orders.

create table if not exists discount_codes (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  code text not null, -- stored uppercase, unique per dealership
  discount_type text not null default 'percentage', -- 'percentage' | 'fixed'
  value numeric(10,2) not null, -- percent (0-100) or a flat rupee amount, per discount_type

  min_order_value numeric(10,2), -- null = no minimum
  max_uses integer, -- null = unlimited
  used_count integer default 0,
  is_active boolean default true,
  expires_at timestamptz, -- null = never expires

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(dealership_id, code)
);

alter table orders add column if not exists discount_code text;
alter table orders add column if not exists discount_amount numeric(10,2) default 0;

create index if not exists idx_discount_codes_dealership_id on discount_codes(dealership_id);

alter table discount_codes enable row level security;

drop policy if exists "discount_codes_dealership_all" on discount_codes;
create policy "discount_codes_dealership_all" on discount_codes
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop trigger if exists on_discount_codes_update on discount_codes;
create trigger on_discount_codes_update
  before update on discount_codes
  for each row execute procedure public.set_ecommerce_updated_at();
