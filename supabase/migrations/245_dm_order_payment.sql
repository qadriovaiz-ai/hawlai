-- 245: confirming an Instagram order's payment — O3 + O4′ of
-- docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28 November
-- 2026.
--
--   orders.instagram_sender_id        WHO to send the invoice to. The
--       conversation's draft row (244) is reused for the customer's next
--       order, so its order_id moves on; the order itself must remember
--       whose DM it came from.
--   orders.payment_reminder_sent_at   the ONE reminder the seller gets
--       15 minutes after an unanswered payment check. Claimed with a
--       conditional update (`is null`), so a dispatcher run that
--       overlaps another cannot remind twice. Also set when the seller
--       answers "Not yet": that IS an answer, so no reminder follows it.
--
-- Both are null on every website order, which is true of them.
--
-- ---- BEFORE RUNNING, against the LIVE database -------------------------
--
--   select column_name from information_schema.columns
--   where table_name = 'orders' and column_name in ('instagram_sender_id', 'payment_reminder_sent_at');
--
-- Expected: NO rows. Any row means part of this already exists — stop and
-- paste it.
--
-- RUN BY HAND, as every migration here is.

alter table orders add column if not exists instagram_sender_id text;
alter table orders add column if not exists payment_reminder_sent_at timestamptz;

-- The reminder sweep's query: unpaid Instagram orders not yet reminded.
create index if not exists idx_orders_dm_payment_waiting
  on orders(created_at)
  where channel = 'instagram' and payment_status = 'pending' and payment_reminder_sent_at is null;

comment on column orders.instagram_sender_id is
  'Seller Mode: the Instagram-scoped id of the customer whose DM placed this order, so the invoice reaches them.';
comment on column orders.payment_reminder_sent_at is
  'Seller Mode: when the seller was reminded to check the UPI payment (once), or told us "not yet". Null = not reminded.';

-- ---- VERIFY, after running ------------------------------------------------
--
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'orders' and column_name in ('instagram_sender_id', 'payment_reminder_sent_at')
--   order by column_name;
--   -- Expected: two rows — instagram_sender_id text YES,
--   -- payment_reminder_sent_at timestamp with time zone YES.
--
--   select indexdef from pg_indexes where indexname = 'idx_orders_dm_payment_waiting';
--   -- Expected: one row, a partial index on created_at.
--
--   select count(*) filter (where instagram_sender_id is not null or payment_reminder_sent_at is not null) as set_rows,
--          count(*) as total from orders;
--   -- Expected: set_rows = 0.
