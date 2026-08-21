-- True LTV / repeat-purchase tracking — P3 piece 8b
-- orders already recorded customer_phone/customer_email/total, so
-- repeat purchases were ALREADY being captured — they were just never
-- grouped per customer. This links an order to a lead so per-customer
-- lifetime value is computable, reusing P2 27a-iii's exact-phone-match
-- identity rule rather than inventing a parallel customer table.
--
-- Nullable by design: a storefront order from someone who was never a
-- lead is normal and stays unlinked.

alter table orders add column if not exists lead_id uuid references leads(id) on delete set null;

create index if not exists idx_orders_lead_id on orders(lead_id) where lead_id is not null;
-- Supports both the backfill lookup and per-customer order grouping
-- for businesses whose buyers never existed as leads.
create index if not exists idx_orders_customer_phone on orders(dealership_id, customer_phone);
