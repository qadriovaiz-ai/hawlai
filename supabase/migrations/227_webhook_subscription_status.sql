-- ============================================================
-- Did Meta agree to send us the webhooks?
-- ============================================================
-- The second half of the auto-reply fix. Migration 226 records whether
-- a webhook ARRIVED; this records whether we ever asked for them.
--
-- WHAT WAS WRONG. Nothing in this codebase had ever subscribed a
-- Facebook Page or an Instagram account to the app, so Meta delivered
-- nothing. A Page is installed on an app through its own
-- `subscribed_apps` edge, with its own token — configuring the webhook
-- product in the Meta App dashboard is necessary and NOT sufficient,
-- and that second step is invisible from the dashboard.
--
-- WHY A COLUMN AND NOT JUST A LOG LINE. The connection has looked
-- perfectly healthy this whole time: a page name, a token, a green
-- tick. The one thing that decided whether anything would ever arrive
-- was not recorded anywhere. These two pairs let the Integrations page
-- say "connected, but Meta is not sending messages, because X" instead
-- of looking fine while nothing comes.
--
-- A TIMESTAMP AND AN ERROR, NEVER BOTH. On success the error is
-- cleared; on failure the timestamp is. A stale "subscribed at" beside
-- a live error would read as "it worked once", which is the exact
-- ambiguity that made this bug take eight days to diagnose.
--
-- Follows the house pattern already on this table: `instagram_error`
-- and `fb_user_token_expires_at`.
--
-- RUN BY HAND, as every migration here is.

alter table dealerships
  add column if not exists fb_webhook_subscribed_at timestamptz,
  add column if not exists fb_webhook_error text,
  add column if not exists ig_webhook_subscribed_at timestamptz,
  add column if not exists ig_webhook_error text;

comment on column dealerships.fb_webhook_subscribed_at is
  'When this Facebook Page was last successfully installed on the app via its subscribed_apps edge, which is what makes Meta deliver messages and feed webhooks for it. NULL means it has never succeeded — see fb_webhook_error. Nothing did this before 12 Nov 2026, which is why auto-reply never fired.';

comment on column dealerships.fb_webhook_error is
  'Why the last Facebook webhook subscription attempt failed, in one sentence, or NULL when the last attempt succeeded. A token without pages_manage_metadata cannot subscribe, so an owner connected before 12 Nov 2026 must reconnect.';

comment on column dealerships.ig_webhook_subscribed_at is
  'The same for an Instagram Business Login account, subscribed through graph.instagram.com with the messages and comments fields.';

comment on column dealerships.ig_webhook_error is
  'Why the last Instagram webhook subscription attempt failed, or NULL when it succeeded.';

-- ---- verify -----------------------------------------------------
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'dealerships'
--     and column_name in ('fb_webhook_subscribed_at', 'fb_webhook_error',
--                         'ig_webhook_subscribed_at', 'ig_webhook_error')
--   order by column_name;
--
-- Expected: FOUR rows — two timestamptz, two text, all nullable (YES).
--
--   select count(*) as businesses,
--          count(fb_webhook_subscribed_at) as fb_subscribed,
--          count(ig_webhook_subscribed_at) as ig_subscribed
--   from dealerships;
--
-- Expected right after running this: fb_subscribed and ig_subscribed
-- are BOTH 0. That is not a bug — it is the bug, finally visible. No
-- Page has ever been subscribed. They fill in as each connection is
-- remade with a token that carries pages_manage_metadata.
--
-- ---- AND WHAT TO DO NEXT, which is not SQL ----------------------
--
-- 1. The Facebook connect flow now asks for pages_messaging,
--    pages_manage_metadata and pages_manage_engagement. An existing
--    token does not have them, so FACEBOOK MUST BE RECONNECTED for the
--    subscription to succeed.
-- 2. On a live Meta app, pages_messaging requires APP REVIEW. Until it
--    is granted, DM replies work only for people with a role on the app
--    (admins, developers, testers). Instagram Business Login already
--    asks for its own messaging permission and is not blocked on this.
-- 3. After reconnecting, send one real DM and run the diagnosis query
--    in migration 226.
