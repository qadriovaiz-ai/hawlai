-- Per-dealership Google Ads connection, mirroring the fb_* columns
-- pattern already used for Facebook. Reuses the same GOOGLE_CLIENT_ID/
-- GOOGLE_CLIENT_SECRET OAuth client already configured for Gmail (same
-- Google Cloud project, adwords scope added on top) — no new OAuth
-- client needed, just a new scope and a new callback route.

alter table dealerships add column if not exists google_ads_customer_id text;
alter table dealerships add column if not exists google_ads_customer_name text;
alter table dealerships add column if not exists google_ads_email text;
alter table dealerships add column if not exists google_ads_access_token text;
alter table dealerships add column if not exists google_ads_refresh_token text;
alter table dealerships add column if not exists google_ads_token_expiry timestamptz;
