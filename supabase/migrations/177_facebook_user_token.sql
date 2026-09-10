-- ============================================================
-- Keep the Facebook USER access token, alongside the Page token
-- ============================================================
-- Connecting Facebook produced a long-lived user token carrying
-- ads_read and ads_management — both requested at connect — used it to
-- list pages and ad accounts, and then discarded it. Only the Page
-- token was stored. A Page token can create and switch campaigns, but
-- cannot read an ad account's objects: the connect callback has said so
-- since pixel discovery was added. Reading a campaign's or ad set's
-- status with it gets:
--
--   (#100) Missing Ads or Marketing Messages permission
--
-- which is what the Campaign Performance History Status column showed,
-- and very likely what chat's "couldn't confirm" messages were.
--
-- Encrypted only, like the Page token since migration 165: there is no
-- plaintext column. The user token expires (~60 days); the expiry is
-- kept so it is not used past it, and the Page token remains the
-- fallback for everything.
--
-- Safe to run late: the app reads these columns in a separate,
-- best-effort query and falls back to the Page token if they are
-- missing. Takes effect for a business after it reconnects Facebook.

alter table dealerships add column if not exists fb_user_access_token_encrypted text;
alter table dealerships add column if not exists fb_user_token_expires_at timestamptz;
