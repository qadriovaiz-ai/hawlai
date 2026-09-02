-- Encrypt marketing OAuth tokens at rest — phase 1 of 2.
--
-- Twelve columns across six integrations. Adds the encrypted columns
-- alongside the existing plaintext ones and drops nothing, so a failed
-- or half-finished backfill stays recoverable and no integration
-- breaks mid-cutover. Application code reads encrypted-first with a
-- plaintext fallback throughout that window.
--
-- NOT INCLUDED, deliberately: fb_page_access_token and
-- instagram_access_token. Neither ever refreshes, and the Meta token
-- spans 13 files across lead ingestion, ad launch and analytics.
-- Touching that surface immediately before the pending live tests
-- would make any regression there impossible to attribute. Those two
-- get their own migration after those tests pass.
--
-- ONE THING WORTH KNOWING before running the backfill: eight of these
-- twelve columns belong to integrations that are INACTIVE pending
-- credentials (Google Ads, LinkedIn, Pinterest, Snapchat), so those
-- rows are likely empty. Gmail and YouTube are the ones with real
-- values to migrate. The backfill reports exactly what it finds.
--
-- RLS: ALTER TABLE, so no policy block. dealerships already has RLS
-- enabled (001_schema.sql:84) with the owner and team policies, and
-- new columns are covered by them automatically.

alter table dealerships
  add column if not exists gmail_access_token_encrypted text,
  add column if not exists gmail_refresh_token_encrypted text,
  add column if not exists youtube_access_token_encrypted text,
  add column if not exists youtube_refresh_token_encrypted text,
  add column if not exists google_ads_access_token_encrypted text,
  add column if not exists google_ads_refresh_token_encrypted text,
  add column if not exists linkedin_access_token_encrypted text,
  add column if not exists linkedin_refresh_token_encrypted text,
  add column if not exists pinterest_access_token_encrypted text,
  add column if not exists pinterest_refresh_token_encrypted text,
  add column if not exists snapchat_access_token_encrypted text,
  add column if not exists snapchat_refresh_token_encrypted text;

comment on column dealerships.gmail_access_token_encrypted is
  'AES-256-GCM ciphertext (v1:iv:tag:data) under MARKETING_ENCRYPTION_KEY. Supersedes gmail_access_token, dropped once the backfill reports zero remaining.';

insert into schema_migrations (version, filename)
values ('165', '165_encrypt_marketing_oauth_tokens.sql')
on conflict (version) do nothing;
