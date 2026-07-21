-- E-commerce Catalog + Orders — turns Website Builder's "products" pages
-- from AI-invented placeholder text into a real product catalog the
-- owner manages, with a real storefront (add to cart, checkout) and
-- real order capture. Payment is COD / "pay on confirmation" for now —
-- no fake "payment successful" state — until a real payment gateway
-- (Razorpay) is connected in a later phase.

create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  name text not null,
  description text,
  price numeric(10,2) not null,
  compare_at_price numeric(10,2), -- optional "was" price for showing a discount
  images jsonb not null default '[]'::jsonb, -- array of image URLs
  sku text,
  category text,
  inventory_count integer, -- null = unlimited / not tracked
  is_active boolean default true,

  order_index integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  website_id uuid references websites(id) on delete set null,

  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  shipping_address text not null,

  items jsonb not null default '[]'::jsonb, -- [{product_id, name, price, quantity}]
  subtotal numeric(10,2) not null,
  total numeric(10,2) not null,

  payment_method text default 'cod', -- 'cod' | 'razorpay' (future)
  payment_status text default 'pending', -- 'pending' | 'paid' | 'failed'
  status text default 'new', -- 'new' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_products_dealership_id on products(dealership_id);
create index if not exists idx_products_active on products(dealership_id, is_active);
create index if not exists idx_orders_dealership_id on orders(dealership_id);
create index if not exists idx_orders_website_id on orders(website_id);

alter table products enable row level security;
alter table orders enable row level security;

drop policy if exists "products_dealership_all" on products;
create policy "products_dealership_all" on products
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop policy if exists "orders_dealership_all" on orders;
create policy "orders_dealership_all" on orders
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create or replace function public.set_ecommerce_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_products_update on products;
create trigger on_products_update
  before update on products
  for each row execute procedure public.set_ecommerce_updated_at();

drop trigger if exists on_orders_update on orders;
create trigger on_orders_update
  before update on orders
  for each row execute procedure public.set_ecommerce_updated_at();
