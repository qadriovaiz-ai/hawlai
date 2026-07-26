-- Fix a real multi-tenant bug: Razorpay was wired to ONE shared
-- platform-wide account (RAZORPAY_KEY_ID/SECRET env vars) — meaning
-- every dealership's customer payments would have landed in whoever
-- owns that single account, not in each individual business's own
-- bank account. Each dealership now connects their OWN Razorpay
-- account (their own Key ID + Key Secret from their own Razorpay
-- dashboard), same principle as "each business gets their own domain/
-- calling number," just applied to payments.
--
-- Note: razorpay_key_secret is sensitive (used for HMAC signature
-- verification) — it's never selected in any public/client-facing
-- query, only read server-side via the service-role client. Storing
-- it encrypted-at-rest (e.g. Supabase Vault) would be a stronger
-- long-term posture than a plain text column; flagging that as a
-- follow-up rather than blocking this fix on it.
alter table dealerships add column if not exists razorpay_key_id text;
alter table dealerships add column if not exists razorpay_key_secret text;
