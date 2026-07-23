-- Product reviews — verified-purchase only. A review is always linked
-- to a real order (order_id) that actually contained the product and
-- was marked 'delivered' by the dealer; POST /api/public/products/[id]/reviews
-- looks that order up server-side from a phone number before inserting,
-- it's never taken on trust from the client. unique(order_id, product_id)
-- stops the same order from reviewing the same product twice.

create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  order_id uuid references orders(id) on delete cascade not null,

  customer_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  is_hidden boolean default false, -- dealer-side moderation

  created_at timestamptz default now(),
  unique(order_id, product_id)
);

create index if not exists idx_reviews_product_id on reviews(product_id);
create index if not exists idx_reviews_dealership_id on reviews(dealership_id);

alter table reviews enable row level security;

drop policy if exists "reviews_dealership_all" on reviews;
create policy "reviews_dealership_all" on reviews
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
