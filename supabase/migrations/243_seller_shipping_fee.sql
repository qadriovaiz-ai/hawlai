-- 243: Seller Mode's flat shipping fee — 28 November 2026.
--
-- THE FOUNDER'S DECISION (28 Nov 2026), after O2: an Instagram order must
-- not silently carry ₹0 shipping just because the seller has no website.
-- One optional number on the Seller Mode card — a flat fee added to every
-- DM order, default ₹0. Deliberately NOT the website builder's shipping
-- system (modes, thresholds): one number the seller can read and change.
--
-- It is the only shipping rule for DM orders, website or not, so the card
-- that switches Seller Mode on is the one place that decides what a DM
-- customer pays for delivery.
--
-- ---- BEFORE RUNNING, against the LIVE database -------------------------
--
--   select column_name from information_schema.columns
--   where table_name = 'dealerships' and column_name = 'seller_shipping_fee';
--
--   select conname from pg_constraint
--   where conname = 'dealerships_seller_shipping_fee_range';
--
-- Expected: NO rows from either. Any row means part of this already
-- exists — stop and paste it.
--
-- RUN BY HAND, as every migration here is.

alter table dealerships add column if not exists seller_shipping_fee numeric(10,2) not null default 0;

alter table dealerships drop constraint if exists dealerships_seller_shipping_fee_range;
alter table dealerships add constraint dealerships_seller_shipping_fee_range
  check (seller_shipping_fee >= 0 and seller_shipping_fee <= 100000);

comment on column dealerships.seller_shipping_fee is
  'Seller Mode: flat delivery fee in rupees added to every Instagram DM order. 0 = free delivery. The only shipping rule for DM orders.';

-- ---- VERIFY, after running ------------------------------------------------
--
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_name = 'dealerships' and column_name = 'seller_shipping_fee';
--   -- Expected: one row — numeric, default 0, is_nullable NO.
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'dealerships_seller_shipping_fee_range';
--   -- Expected: CHECK (((seller_shipping_fee >= (0)::numeric) AND (seller_shipping_fee <= (100000)::numeric)))
--
--   select count(*) filter (where seller_shipping_fee = 0) as at_zero, count(*) as total from dealerships;
--   -- Expected: at_zero = total — every business starts at free delivery.
