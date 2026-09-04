-- Shopify expiring offline access tokens.
--
-- WHY: Shopify rejected every Admin API read with
--
--   "[API] Non-expiring access tokens are no longer accepted for the
--    Admin API. Start using expiring offline tokens."
--
-- New public apps must use expiring offline tokens as of 1 April 2026
-- (all public apps by 1 January 2027). Our OAuth exchange never sent
-- `expiring=1`, so Shopify issued a non-expiring token — accepted at
-- issue time and refused at read time. That is why the failure looked
-- like a permissions problem for three rounds: OAuth completed, a
-- token existed, and nothing broke until we tried to USE it.
--
-- An expiring token lives 60 minutes and arrives with a refresh token
-- good for 90 days, so one column is no longer enough.

alter table dealerships
  add column if not exists shopify_refresh_token_encrypted text,
  add column if not exists shopify_token_expires_at timestamptz,
  add column if not exists shopify_refresh_token_expires_at timestamptz,
  add column if not exists shopify_refresh_lock_at timestamptz;

comment on column dealerships.shopify_refresh_token_encrypted is
  'AES-256-GCM ciphertext (v1:iv:tag:data) under COMMERCE_ENCRYPTION_KEY. Arguably MORE sensitive than the access token: it mints new access tokens for 90 days without merchant interaction.';

-- ABSOLUTE timestamps, not the raw expires_in seconds Shopify returns.
-- A stored duration is meaningless without also storing when it was
-- issued, and that pairing is exactly what goes stale.
comment on column dealerships.shopify_token_expires_at is
  'When the current Shopify access token expires (~60 minutes after issue). Refreshed with a 5-minute margin.';

comment on column dealerships.shopify_refresh_token_expires_at is
  'When the refresh token expires (~90 days). Past this the merchant must reconnect through OAuth — there is no way back without them.';

-- ------------------------------------------------------------------
-- THE REFRESH LOCK, and why a plain timestamp column is the mutex.
-- ------------------------------------------------------------------
-- Shopify ROTATES refresh tokens: every refresh returns a new one and
-- invalidates the old. It also keeps exactly one current expiring
-- offline token per app+store. So two concurrent refreshes are
-- destructive, not merely wasteful — the loser's token is already dead
-- at Shopify before either process writes anything, which means no
-- amount of last-write-wins reconciliation can repair it. The race has
-- to be prevented, not resolved.
--
-- This is genuinely new here. The existing refresh helpers
-- (getValidGoogleAdsAccessToken, gmailAgent, youtubeAgent) have NO
-- concurrency handling at all, and correctly so: Google reuses the
-- same refresh token indefinitely, so a concurrent refresh there costs
-- a wasted request and nothing else.
--
-- WHY NOT pg_advisory_lock: Supabase pools connections, and a
-- session-scoped advisory lock is unreliable under transaction
-- pooling. pg_advisory_xact_lock would be correct but needs an
-- explicit transaction, which supabase-js does not expose.
--
-- A conditional UPDATE is atomic at row level, needs no transaction,
-- and works through the pooler: the winner is whoever's UPDATE
-- matches. The staleness window means a process that crashes
-- mid-refresh cannot wedge the connection permanently.
comment on column dealerships.shopify_refresh_lock_at is
  'Mutex for token refresh, claimed by a conditional UPDATE. Held ~2 minutes; a stale value is reclaimable so a crashed refresh cannot wedge the connection. NOT a general-purpose lock — do not reuse for anything else.';

insert into schema_migrations (version, filename)
values ('169', '169_shopify_expiring_tokens.sql')
on conflict (version) do nothing;
