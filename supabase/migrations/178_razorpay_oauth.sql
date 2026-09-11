-- 178: Connect Razorpay (OAuth) — replaces pasting a Key ID + Key Secret.
--
-- The owner signs in on Razorpay and approves Hawlai's partner app;
-- Razorpay returns tokens scoped to their account. The two tokens are
-- secrets and are only ever stored encrypted (AES-256-GCM under
-- COMMERCE_ENCRYPTION_KEY, like razorpay_key_secret_encrypted). The
-- public token is Razorpay's publishable Checkout key, and the account
-- id is an identifier — neither is secret.
--
-- Safe to run before or after the deploy: the code reads dealerships
-- with select("*") and works on either shape. Until this runs,
-- "Connect Razorpay" fails at the save step with nothing changed.

alter table dealerships
  add column if not exists razorpay_oauth_access_token_encrypted text,
  add column if not exists razorpay_oauth_refresh_token_encrypted text,
  add column if not exists razorpay_oauth_public_token text,
  add column if not exists razorpay_account_id text,
  add column if not exists razorpay_oauth_expires_at timestamptz,
  add column if not exists razorpay_oauth_mode text;

comment on column dealerships.razorpay_oauth_access_token_encrypted is
  'AES-256-GCM ciphertext (v1:iv:tag:data) of the Connect Razorpay access token (90 days), under COMMERCE_ENCRYPTION_KEY.';
comment on column dealerships.razorpay_oauth_refresh_token_encrypted is
  'AES-256-GCM ciphertext of the Connect Razorpay refresh token (180 days), under COMMERCE_ENCRYPTION_KEY.';
comment on column dealerships.razorpay_oauth_public_token is
  'Razorpay public_token — the publishable key Checkout.js opens with for a Connect Razorpay account.';
comment on column dealerships.razorpay_oauth_expires_at is
  'When the access token lapses; refreshed automatically in the 7 days before.';
