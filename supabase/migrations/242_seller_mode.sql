-- 242: Seller Mode — F4 of docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November
-- 2026 (UPI-direct revision).
--
-- ONE MIGRATION FOR THE WHOLE OF SELLER MODE'S SCHEMA, as the plan
-- bundled it, so the order pieces that follow need none of their own:
--
--   dealerships.instagram_selling_enabled   the switch. Separate from
--       dm_auto_reply_enabled on purpose — "answer my DMs" and "take
--       orders and ask customers for money in my DMs" are different
--       promises, so they are different switches.
--   dealerships.seller_upi_vpa              where customers pay: the
--       seller's own UPI ID. Money goes straight to the seller; Hawlai
--       never holds it. Not a secret — it is a payment ADDRESS customers
--       are given — so it is not encrypted.
--   orders.channel                          where an order came from.
--       Every order before this came from website checkout, so the
--       default is 'website' and is TRUE for every existing row.
--   orders.upi_reference                    the reference the UPI request
--       carries, so a payment the seller sees can be matched to an order.
--
-- THE VPA FORMAT IS CHECKED HERE AS WELL AS IN THE APP. A UPI ID that
-- cannot be paid is worse than none: the customer is sent it and the
-- payment fails. The app lower-cases and validates first
-- (src/lib/dm/sellerMode.ts); this is the line a later code path cannot
-- cross by accident.
--
-- ---- BEFORE RUNNING, against the LIVE database -------------------------
--
--   select table_name, column_name from information_schema.columns
--   where (table_name = 'dealerships' and column_name in ('instagram_selling_enabled', 'seller_upi_vpa'))
--      or (table_name = 'orders' and column_name in ('channel', 'upi_reference'));
--
-- Expected: NO rows. Any row means part of this already exists — stop and
-- paste it.
--
--   select conname from pg_constraint
--   where conname in ('dealerships_seller_upi_vpa_format', 'orders_channel_check');
--
-- Expected: NO rows.
--
-- RUN BY HAND, as every migration here is.

alter table dealerships add column if not exists instagram_selling_enabled boolean not null default false;
alter table dealerships add column if not exists seller_upi_vpa text;

alter table dealerships drop constraint if exists dealerships_seller_upi_vpa_format;
alter table dealerships add constraint dealerships_seller_upi_vpa_format
  check (seller_upi_vpa is null or seller_upi_vpa ~ '^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$');

alter table orders add column if not exists channel text not null default 'website';
alter table orders drop constraint if exists orders_channel_check;
alter table orders add constraint orders_channel_check
  check (channel in ('website', 'instagram', 'facebook'));

alter table orders add column if not exists upi_reference text;

comment on column dealerships.instagram_selling_enabled is
  'Seller Mode: take orders and send UPI payment requests in Instagram DMs. Needs Instagram connected, seller_upi_vpa saved and DM auto-reply on. Switching off is never gated.';
comment on column dealerships.seller_upi_vpa is
  'The seller''s own UPI ID (VPA). Customers pay it directly; Hawlai never holds money. Lower-case, format-checked.';
comment on column orders.channel is
  'Where the order came from: website | instagram | facebook. Every order before migration 242 was website checkout.';

-- ---- VERIFY, after running ---------------------------------------------
--
--   select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where (table_name = 'dealerships' and column_name in ('instagram_selling_enabled', 'seller_upi_vpa'))
--      or (table_name = 'orders' and column_name in ('channel', 'upi_reference'))
--   order by table_name, column_name;
--
-- Expected four rows: dealerships.instagram_selling_enabled boolean NO
-- default false; dealerships.seller_upi_vpa text YES; orders.channel text
-- NO default 'website'; orders.upi_reference text YES.
--
--   select channel, count(*) from orders group by channel;
--
-- Expected: one row, 'website', with every existing order.
