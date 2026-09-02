-- Drop the plaintext commerce secret columns. R1 phase 2 of 2.
--
-- Migration 160 added the encrypted columns alongside the originals,
-- deliberately dropping nothing, so a failed backfill would be
-- recoverable. This completes that cutover.
--
-- SAFE TO RUN, and the evidence rather than the assurance:
--   - A direct probe on 2026-09-02 found all three plaintext columns
--     NULL across all 8 dealerships. No business has ever connected
--     Razorpay, Shopify or WooCommerce, so there is nothing to lose.
--   - encryptedWrite() has written only the encrypted column since
--     commit 4b80575, so nothing has been added since.
--   - Application code no longer NAMES these columns. The commerce
--     secret helpers select the _encrypted columns only.
--
-- ORDER MATTERS, and an earlier version of this comment said it did
-- not. Correcting that: this must run AFTER the code that stopped
-- naming these columns is deployed. The NEW code is order-independent
-- because it never mentions them — but the OLD code selects
-- razorpay_key_secret, so dropping it while that build is still
-- serving traffic breaks checkout. That is migration 160's failure in
-- the opposite direction, and just as avoidable.
--
-- Run order used: 163 and 165 (both additive) -> deploy -> backfill
-- -> this.
--
-- RLS: ALTER TABLE, so no policy block. dealerships already has RLS
-- enabled (001_schema.sql:84) with owner and team policies. Dropping a
-- column does not change what those policies govern.

alter table dealerships
  drop column if exists razorpay_key_secret,
  drop column if exists shopify_access_token,
  drop column if exists woocommerce_consumer_secret;

-- Ledger row, per the convention migration 163 established.
insert into schema_migrations (version, filename)
values ('164', '164_drop_plaintext_commerce_secrets.sql')
on conflict (version) do nothing;
