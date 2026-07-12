-- ============================================================
-- New integrations — Slack, Shopify, WooCommerce
-- ============================================================
-- Slack: dealer creates their own free Incoming Webhook (Slack's own
-- self-serve flow, no approval process) and pastes the URL in.
--
-- Shopify/WooCommerce: instead of Hawlai registering its own public
-- app with each platform (a real approval process, same category as
-- Google/LinkedIn/TikTok Ads), the merchant generates their own
-- Admin API access token within their OWN store admin (a couple of
-- minutes, self-serve, zero approval needed on Hawlai's side) and
-- pastes it in — same trust model as an API key, not OAuth.

alter table dealerships add column if not exists slack_webhook_url text;

alter table dealerships add column if not exists shopify_store_url text;
alter table dealerships add column if not exists shopify_access_token text;

alter table dealerships add column if not exists woocommerce_store_url text;
alter table dealerships add column if not exists woocommerce_consumer_key text;
alter table dealerships add column if not exists woocommerce_consumer_secret text;
