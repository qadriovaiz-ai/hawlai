-- WooCommerce one-click connect. Connection audit item A6.
--
-- WHY: connecting WooCommerce required the dealer to open wp-admin,
-- navigate to WooCommerce → Settings → Advanced → REST API, add a key,
-- choose Read access, generate it, and copy a ck_... and a cs_... back
-- into a form. WooCommerce ships its own app-authorisation endpoint
-- (/wc-auth/v1/authorize) for precisely this, and unlike Shopify it
-- needs no app registration and no review — any store can authorise
-- any app. The dealer now supplies only their store address.
--
-- WHY A PENDING COLUMN IS NEEDED AT ALL. WooCommerce does not hand the
-- credentials back through the browser. It POSTs them server-to-server
-- to a callback URL, which therefore cannot require a logged-in
-- session — the callback is reachable by anyone on the internet. The
-- only thing WooCommerce carries through the round trip is the
-- `user_id` parameter, which it echoes back untouched.
--
-- So `user_id` is what decides which business receives the
-- credentials, and it CANNOT be the dealership id: anyone who learned
-- an id could POST their own store's keys and repoint that business's
-- product feed at a store they control. It is a 256-bit single-use
-- nonce instead, and this column is where the nonce lives between the
-- redirect out and the callback in.
--
-- Shape mirrors fb_connect_pending (migration 035): a jsonb blob on
-- dealerships holding {nonce, store_url, created_at}, nulled the
-- moment the callback consumes it. A dedicated table was considered
-- and rejected — there is at most one in-flight connection per
-- business, and the FB flow already established this pattern for the
-- identical problem.
--
-- The nonce is short-lived by CODE, not by constraint: the callback
-- checks created_at against a 15-minute TTL (isPendingFresh in
-- src/lib/commerce/wooAuth.ts). A stale row is inert rather than
-- dangerous, but it should not sit there indefinitely either.

alter table dealerships
  add column if not exists woocommerce_connect_pending jsonb;

comment on column dealerships.woocommerce_connect_pending is
  'In-flight /wc-auth/v1/authorize handshake: {nonce, store_url, created_at}. The nonce is the ONLY authenticator on the unauthenticated callback, so it must stay unguessable, single-use and short-lived. Nulled on completion. Never expose this to the client.';

-- Looking a callback up by nonce is the hot path, and it is the one
-- query an attacker can trigger. Indexed so a probing flood cannot
-- turn into a sequential scan per request.
create index if not exists idx_dealerships_woo_connect_nonce
  on dealerships ((woocommerce_connect_pending ->> 'nonce'))
  where woocommerce_connect_pending is not null;

insert into schema_migrations (version, filename)
values ('166', '166_woocommerce_connect_pending.sql')
on conflict (version) do nothing;
