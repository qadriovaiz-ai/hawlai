-- Abandoned cart recovery — privacy-respecting by construction: a row
-- is only ever written once the customer has voluntarily typed a phone
-- number or email into the checkout form (enforced server-side in
-- POST /api/public/abandoned-carts, never on keystrokes alone). Items
-- are the client-reported cart snapshot for dealer visibility only —
-- never re-verified or charged, this table drives no money movement.
-- No automatic email/WhatsApp send exists yet; the dealer follows up
-- manually from the panel.

create table if not exists abandoned_carts (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  website_id uuid references websites(id) on delete cascade not null,

  customer_name text,
  customer_phone text,
  customer_email text,
  shipping_address text,
  items jsonb not null default '[]'::jsonb, -- [{productId, name, price, quantity}]

  contacted boolean default false, -- dealer marks this once they've followed up

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_abandoned_carts_dealership_id on abandoned_carts(dealership_id);
create index if not exists idx_abandoned_carts_website_phone on abandoned_carts(website_id, customer_phone);
create index if not exists idx_abandoned_carts_website_email on abandoned_carts(website_id, customer_email);

alter table abandoned_carts enable row level security;

drop policy if exists "abandoned_carts_dealership_all" on abandoned_carts;
create policy "abandoned_carts_dealership_all" on abandoned_carts
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop trigger if exists on_abandoned_carts_update on abandoned_carts;
create trigger on_abandoned_carts_update
  before update on abandoned_carts
  for each row execute procedure public.set_ecommerce_updated_at();
