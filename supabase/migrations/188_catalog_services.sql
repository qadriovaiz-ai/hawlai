-- ============================================================
-- Services in the catalogue: an item is a product (bought, shipped) or
-- a service (booked).
--
-- Approved 2026-09-17 (industry-agnostic overhaul, Phase 2): services
-- live on the products table as a flag, not a separate table, so they
-- share prices, the claims check, website listings and email.
--
-- Every existing item stays a product. A service carries an optional
-- duration and an optional booking link; without a link, the store sends
-- customers to the business's own booking page.
-- ============================================================

alter table products add column if not exists kind text not null default 'product';
alter table products drop constraint if exists products_kind_check;
alter table products add constraint products_kind_check check (kind in ('product', 'service'));

alter table products add column if not exists duration_minutes integer;
alter table products drop constraint if exists products_duration_minutes_check;
alter table products add constraint products_duration_minutes_check check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 1440));

alter table products add column if not exists booking_url text;
alter table products drop constraint if exists products_booking_url_check;
alter table products add constraint products_booking_url_check check (booking_url is null or booking_url ~* '^https?://');

create index if not exists idx_products_dealership_kind on products(dealership_id, kind);
