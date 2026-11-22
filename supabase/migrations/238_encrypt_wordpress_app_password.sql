-- Encrypt the WordPress application password at rest.
--
-- THE FINDING, 22 November 2026, while sizing WordPress/WooCommerce
-- support. Migration 160 encrypted razorpay_key_secret,
-- shopify_access_token and woocommerce_consumer_secret, and migration
-- 164 dropped their plaintext originals. `wordpress_app_password` was
-- added separately, in migration 025, and nobody came back for it — so
-- it has sat in plaintext for the whole period the other three were
-- ciphertext.
--
-- IT IS THE MOST POWERFUL OF THE FOUR. A WordPress application password
-- has NO SCOPES: it carries exactly the capabilities of the user it
-- belongs to, so an administrator's app password is administrator
-- access to the entire site — posts, pages, media, users, plugins. A
-- dump of the dealerships table yielded that in the clear for every
-- merchant who had connected a site.
--
-- ONE PHASE, NOT TWO, AND THE REASON IS SPECIFIC TO THIS COLUMN.
-- Migration 160 was deliberately two-phase because it touched live
-- checkout credentials: a half-finished backfill had to be recoverable
-- and could never be allowed to take payments down. This column feeds
-- NOTHING. WordPress has no publish path at all — the only writer,
-- publishWordPressPost, had zero callers and was deleted on the same
-- day — so the sole consumer is the Settings panel that stores it.
-- There is no backfill worth writing machinery for: a stored value
-- becomes unreadable and the owner reconnects, which is one form
-- submission, and reconnecting is also the only way to get a value
-- that was never encrypted under the current key.
--
-- RUN THE COUNT BELOW FIRST. If any row has a password stored, that
-- site must be reconnected after this runs. The verify query at the
-- bottom confirms the new column exists and the old one is gone.
--
-- RLS: this is ALTER TABLE, not CREATE TABLE. dealerships already has
-- row level security enabled (001_schema.sql:84) with
-- "dealerships_owner_all" and "dealerships_team_read", and new columns
-- are covered by those automatically. Adding a policy here would be
-- redundant and would obscure which one governs the table.
--
-- The read path: src/app/api/integrations/wordpress/route.ts goes
-- through src/lib/crypto/commerceSecrets.ts like every other commerce
-- secret, and that route's GET fails CLOSED — it reports "not
-- connected" and logs the reason if this column is missing, so the code
-- is safe to deploy before or after this migration runs.

-- ---------------------------------------------------------------
-- 0. BEFORE YOU RUN: how many sites will need reconnecting?
-- ---------------------------------------------------------------
-- select count(*) filter (where wordpress_app_password is not null) as will_need_reconnect,
--        count(*) filter (where wordpress_site_url is not null)     as sites_configured
-- from dealerships;

begin;

alter table dealerships
  add column if not exists wordpress_app_password_encrypted text;

comment on column dealerships.wordpress_app_password_encrypted is
  'AES-256-GCM ciphertext (v1:iv:tag:data) of the WordPress application password, under COMMERCE_ENCRYPTION_KEY. Supersedes wordpress_app_password, dropped in this same migration — see its header for why one phase rather than two.';

alter table dealerships
  drop column if exists wordpress_app_password;

-- The assertion lives INSIDE the transaction, so a failure rolls the
-- whole thing back rather than leaving the table half-changed. Supabase
-- opens a new connection per Run, so this must be one script.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'dealerships' and column_name = 'wordpress_app_password_encrypted'
  ) then
    raise exception 'wordpress_app_password_encrypted was not created';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_name = 'dealerships' and column_name = 'wordpress_app_password'
  ) then
    raise exception 'the plaintext wordpress_app_password column is still present';
  end if;
end $$;

insert into schema_migrations (version, filename)
values ('238', '238_encrypt_wordpress_app_password.sql')
on conflict (version) do nothing;

commit;

-- ---------------------------------------------------------------
-- VERIFY (run after commit)
-- ---------------------------------------------------------------
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'dealerships' and column_name like 'wordpress%'
-- order by column_name;
--
-- Expect exactly: wordpress_app_password_encrypted (text),
--                 wordpress_site_url (text), wordpress_username (text)
-- and NO wordpress_app_password.
