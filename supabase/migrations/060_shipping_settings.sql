-- Shipping rules — a dealer picks one of three modes for their store:
-- 'free' (always free, the existing behaviour, kept as the default so
-- nothing changes for a website that hasn't touched this setting),
-- 'flat' (a fixed rate on every order), or 'free_above' (flat rate
-- below a threshold, free at or above it). Computed server-side in
-- src/lib/shipping.ts and re-verified on every order, same principle
-- as price/discount recomputation.

alter table websites add column if not exists shipping_mode text default 'free'; -- 'flat' | 'free_above' | 'free'
alter table websites add column if not exists shipping_rate numeric(10,2) default 0;
alter table websites add column if not exists shipping_free_threshold numeric(10,2);

alter table orders add column if not exists shipping_amount numeric(10,2) default 0;
