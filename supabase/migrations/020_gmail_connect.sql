-- ============================================================
-- Gmail Connect — real email sending, genuinely free
-- ============================================================
-- Instead of a paid email-sending service (Resend/SendGrid), the
-- dealer connects their OWN Gmail account via OAuth (same pattern as
-- Facebook Connect) and emails send through their own Gmail — no new
-- paid account needed, just a one-time Google sign-in.

alter table dealerships add column if not exists gmail_email text;
alter table dealerships add column if not exists gmail_access_token text;
alter table dealerships add column if not exists gmail_refresh_token text;
alter table dealerships add column if not exists gmail_token_expiry timestamptz;
