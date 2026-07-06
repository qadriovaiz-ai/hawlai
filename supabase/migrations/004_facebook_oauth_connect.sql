-- Per-dealership Facebook/Meta connection details, so each dealer's own
-- Page, Ad Account and Lead Form are used instead of hardcoded env vars.
alter table dealerships add column if not exists fb_page_id text;
alter table dealerships add column if not exists fb_page_name text;
alter table dealerships add column if not exists fb_page_access_token text;
alter table dealerships add column if not exists fb_ad_account_id text;
alter table dealerships add column if not exists fb_lead_form_id text;
alter table dealerships add column if not exists fb_lead_form_name text;

-- Temporary holding area between OAuth callback and the "choose your page/
-- ad account/lead form" screen. Cleared once the dealer finalises their choice.
alter table dealerships add column if not exists fb_connect_pending jsonb;
