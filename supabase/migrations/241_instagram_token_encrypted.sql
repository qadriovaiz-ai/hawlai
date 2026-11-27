-- 241: the Instagram token, encrypted, with its expiry — F3 of
-- docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
--
-- THE LAST META CREDENTIAL IN THE CLEAR. Every other OAuth secret moved
-- behind src/lib/crypto/oauthSecrets.ts in the security remediation; its
-- own header said "STILL NOT IN SCOPE: instagram_access_token ... next
-- pass". This is that pass — and it matters more now than when it was
-- deferred: the Instagram token now answers customers unattended.
--
-- AND IT EXPIRES. An Instagram long-lived token lasts about 60 days and
-- nothing refreshed it, so every connection died on a schedule, silently.
-- `instagram_token_expires_at` is what the daily refresh reads to know a
-- token is due — and NULL means "unknown", which is every connection made
-- before this migration: the refresh treats unknown as due.
--
-- THE PLAINTEXT COLUMN STAYS, for now. Reads are encrypted-first with a
-- plaintext fallback (the Page token's rule), and every write — connect,
-- manual entry, refresh — writes encrypted and NULLS plaintext in the same
-- statement. The first successful daily refresh migrates each row.
--
-- ---- BEFORE RUNNING ----------------------------------------------------
--
--   select column_name from information_schema.columns
--   where table_name = 'dealerships'
--     and column_name in ('instagram_access_token', 'instagram_access_token_encrypted', 'instagram_token_expires_at');
--
-- Expected: ONE row, instagram_access_token. If either new column is
-- already there, stop and paste it.
--
-- RUN BY HAND, as every migration here is.

alter table dealerships add column if not exists instagram_access_token_encrypted text;
alter table dealerships add column if not exists instagram_token_expires_at timestamptz;

comment on column dealerships.instagram_access_token_encrypted is
  'Instagram Login token, encrypted (oauthSecrets, "marketing" key ring). Read first; instagram_access_token is the plaintext fallback until the daily refresh migrates the row.';
comment on column dealerships.instagram_token_expires_at is
  'When the stored Instagram token expires. NULL = unknown (connected before migration 241), which the daily refresh treats as due.';

-- ---- VERIFY, after running ---------------------------------------------
--
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'dealerships'
--     and column_name in ('instagram_access_token', 'instagram_access_token_encrypted', 'instagram_token_expires_at')
--   order by column_name;
--
-- Expected: three rows — instagram_access_token text YES,
-- instagram_access_token_encrypted text YES, instagram_token_expires_at
-- timestamp with time zone YES.
