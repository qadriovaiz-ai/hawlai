-- Shopify one-click connect. Connection audit Group B.
--
-- WHY: connecting Shopify meant opening the store admin, going to
-- Settings → Apps → Develop apps, creating a custom app, granting it
-- Products read access, installing it, and copying an Admin API access
-- token (shpat_...) into a password field. The public app is now
-- registered, so the dealer enters their .myshopify.com address and
-- approves on Shopify instead.
--
-- Same shape and same reasoning as 166 (WooCommerce): a jsonb blob
-- holding {nonce, shop, created_at}, nulled when the callback consumes
-- it. The nonce travels as OAuth `state`.
--
-- ONE IMPORTANT DIFFERENCE FROM 166, so the two are not assumed
-- identical. WooCommerce signs nothing — its flow has no app
-- registration and therefore no shared secret — so there the nonce is
-- the ONLY authenticator. Shopify signs the callback query string with
-- the app's client secret, so the nonce is the second of three checks:
-- the HMAC proves Shopify sent the callback, the shop-domain pattern
-- prevents the token exchange being pointed at an attacker's host, and
-- the nonce ties the callback to a business.
--
-- The nonce still must be unguessable and single-use: without it, a
-- valid Shopify callback for ANY store could be replayed against a
-- business that never asked for it.

alter table dealerships
  add column if not exists shopify_connect_pending jsonb;

comment on column dealerships.shopify_connect_pending is
  'In-flight Shopify OAuth handshake: {nonce, shop, created_at}. The nonce travels as OAuth state and ties the callback to this business; Shopify''s HMAC is what proves the callback is genuine. Single-use, 15-minute TTL, nulled on completion. Never expose this to the client.';

create index if not exists idx_dealerships_shopify_connect_nonce
  on dealerships ((shopify_connect_pending ->> 'nonce'))
  where shopify_connect_pending is not null;

insert into schema_migrations (version, filename)
values ('167', '167_shopify_connect_pending.sql')
on conflict (version) do nothing;
