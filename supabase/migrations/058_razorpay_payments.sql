-- Razorpay online payments — adds columns to identify and verify a
-- Razorpay payment on an order. A Razorpay-paid order is only ever
-- inserted with payment_status = 'paid' after the payment signature
-- has been verified server-side (see /api/public/orders/verify-payment) —
-- the client-side Checkout.js "success" callback is never trusted alone.

alter table orders add column if not exists razorpay_order_id text;
alter table orders add column if not exists razorpay_payment_id text;
alter table orders add column if not exists razorpay_signature text;

create index if not exists idx_orders_razorpay_order_id on orders(razorpay_order_id);
