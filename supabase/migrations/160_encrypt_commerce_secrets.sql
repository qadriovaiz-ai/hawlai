-- Encrypt payment and commerce secrets at rest — R1, phase 1 of 2.
--
-- Audit finding: razorpay_key_secret is stored in plaintext and read
-- by public-facing order and payment-verification routes. A dump of
-- the dealerships table yields live payment credentials for every
-- merchant on the platform. shopify_access_token and
-- woocommerce_consumer_secret are the same class of problem — full
-- read/write access to a merchant's store.
--
-- TWO-PHASE ON PURPOSE. This migration ADDS the encrypted columns and
-- drops nothing. The plaintext columns stay populated until a backfill
-- has been run and verified, and application code reads the encrypted
-- column with a plaintext fallback throughout that window. A failed or
-- half-finished backfill is therefore recoverable and can never take
-- checkout down. Dropping the plaintext columns is migration 161,
-- to be written and run only once the backfill is confirmed.
--
-- RLS: this is ALTER TABLE, not CREATE TABLE. dealerships already has
-- row level security enabled (001_schema.sql:84) with the
-- "dealerships_owner_all" and "dealerships_team_read" policies, and
-- new columns are covered by them automatically. Adding a policy here
-- would be redundant and would obscure which one governs the table.
--
-- NOTE on the read path these columns feed: service-role code reads
-- these for storefront checkout, which bypasses RLS by design — the
-- storefront buyer is anonymous and has no session. RLS is not the
-- control protecting these values from a buyer; encryption at rest and
-- the fact that no route returns them to a client are. Verified: the
-- Razorpay secret is never sent to the browser — /api/public/payment-config
-- returns only razorpay_key_id, Razorpay's publishable identifier.

alter table dealerships
  add column if not exists razorpay_key_secret_encrypted text,
  add column if not exists shopify_access_token_encrypted text,
  add column if not exists woocommerce_consumer_secret_encrypted text;

comment on column dealerships.razorpay_key_secret_encrypted is
  'AES-256-GCM ciphertext (v1:iv:tag:data) of the Razorpay key secret, under COMMERCE_ENCRYPTION_KEY. Supersedes razorpay_key_secret, which is dropped in migration 161 once backfilled.';

comment on column dealerships.shopify_access_token_encrypted is
  'AES-256-GCM ciphertext (v1:iv:tag:data) of the Shopify access token, under COMMERCE_ENCRYPTION_KEY. Supersedes shopify_access_token.';

comment on column dealerships.woocommerce_consumer_secret_encrypted is
  'AES-256-GCM ciphertext (v1:iv:tag:data) of the WooCommerce consumer secret, under COMMERCE_ENCRYPTION_KEY. Supersedes woocommerce_consumer_secret.';
