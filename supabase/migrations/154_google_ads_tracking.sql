-- Google Ads remarketing tag + conversion tracking — piece 4/7.
--
-- VERIFIED before writing: these are NOT derivable from what's
-- already stored. dealerships.google_ads_customer_id (migration 035)
-- is the ACCOUNT id used by the Marketing API (e.g. 123-456-7890);
-- the conversion id is a TAG identifier (AW-XXXXXXXXX) obtainable only
-- from the Google Ads UI under Conversions, paired with a per-action
-- label as send_to: 'AW-ID/LABEL'. Three genuinely different things.
--
-- Also verified: the existing gtag('config', gaId) sets up Analytics
-- only. Remarketing needs a SECOND gtag('config', 'AW-...') on the
-- same shared tag — which is why this is config, not a new script.

alter table dealerships add column if not exists google_ads_conversion_id text;    -- 'AW-XXXXXXXXX'
alter table dealerships add column if not exists google_ads_conversion_label text; -- purchase action label

-- Gates the remarketing / dynamic-remarketing parameters.
--
-- OFF by default on purpose: dynamic remarketing requires
-- ecomm_prodid values that match MERCHANT CENTER product ids, and no
-- Merchant Center feed exists until piece 7. Defaulting this on would
-- make the tag look active while showing nothing.
alter table dealerships add column if not exists google_remarketing_enabled boolean not null default false;

-- No new table: Google conversions reuse conversion_events from
-- migration 153 with event_name = 'google_purchase', so both
-- platforms' delivery is observable in one place instead of two
-- parallel logs that could disagree.
