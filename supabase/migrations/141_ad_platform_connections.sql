-- Ad platform connections — P3 piece 6 (platforms 2-4)
-- Same per-dealership token-column shape as the existing google_ads_*
-- and fb_* connections. No new RLS needed — dealerships is already
-- owner-scoped.
--
-- ad_account_id is stored separately from the account/org id on every
-- platform here: all three distinguish "who you are" from "which ad
-- account you're spending from," and a business can have several.

-- Pinterest
alter table dealerships add column if not exists pinterest_account_id text;
alter table dealerships add column if not exists pinterest_ad_account_id text;
alter table dealerships add column if not exists pinterest_access_token text;
alter table dealerships add column if not exists pinterest_refresh_token text;
alter table dealerships add column if not exists pinterest_token_expiry timestamptz;

-- Snapchat
alter table dealerships add column if not exists snapchat_org_id text;
alter table dealerships add column if not exists snapchat_ad_account_id text;
alter table dealerships add column if not exists snapchat_access_token text;
alter table dealerships add column if not exists snapchat_refresh_token text;
alter table dealerships add column if not exists snapchat_token_expiry timestamptz;

-- LinkedIn
alter table dealerships add column if not exists linkedin_organization_id text;
alter table dealerships add column if not exists linkedin_ad_account_id text;
alter table dealerships add column if not exists linkedin_access_token text;
alter table dealerships add column if not exists linkedin_refresh_token text;
alter table dealerships add column if not exists linkedin_token_expiry timestamptz;
