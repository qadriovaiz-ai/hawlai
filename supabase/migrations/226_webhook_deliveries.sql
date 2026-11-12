-- ============================================================
-- Did Meta call us, and which gate stopped it?
-- ============================================================
-- THE BUG THIS EXISTS FOR. The DM and comment auto-reply toggles have
-- been ON in production, and `auto_reply_log` has had ZERO rows, ever.
-- Eight days passed between noticing that and diagnosing it, because
-- nothing in the path records why it did nothing.
--
-- `handleAutoReplyEntry` has four early returns — no entry id, no
-- business matched, no reply token, both toggles off — and every one of
-- them returns silently. The webhook route has a fifth: a rejected
-- signature, which writes a console line and a 401.
--
-- AND auto_reply_log CANNOT RECORD THE FIRST TWO, structurally: its
-- `dealership_id` is NOT NULL (migration 033), and the two earliest
-- gates fire precisely when there is no business to attribute a row to.
-- So the most important question of all — DID META EVER CALL US — is
-- one that table can never answer.
--
-- This one can. One row per webhook entry received, with a nullable
-- dealership, so "nobody called" and "somebody called about a page we
-- do not know" are different and visible facts.
--
-- METADATA ONLY, DELIBERATELY. No message text, no sender id, no
-- comment body. `auto_reply_log` already keeps the conversation for a
-- matched business, where the owner has a relationship with the person
-- writing. A row here can be about a page belonging to nobody on this
-- platform, and storing a stranger's words against no owner is
-- collection with no purpose and no retention answer.
--
-- RUN BY HAND, as every migration here is.

create table if not exists webhook_deliveries (
  id uuid primary key default uuid_generate_v4(),
  -- Which endpoint took the call. Meta allows one Callback URL per Page
  -- product, so in practice this is meta-leads; meta-messaging exists
  -- for the day a second URL is configured.
  source text not null,
  -- The Page id or Instagram Business Account id Meta named. Kept even
  -- when it matches nothing, because "a delivery arrived for a page id
  -- we do not have" is the single most diagnostic row in the table.
  entry_id text,
  -- NULLABLE ON PURPOSE. A delivery that matched no business is the
  -- interesting case; the NOT NULL on auto_reply_log is exactly why
  -- that case has been invisible.
  dealership_id uuid references dealerships(id) on delete cascade,
  -- Which gate ended it, or that it was handled. Not a free-text field:
  -- the point is to be able to count them.
  outcome text not null check (outcome in (
    'signature_rejected',
    'no_entry_id',
    'no_business_matched',
    'no_reply_token',
    'both_toggles_off',
    'nothing_to_reply_to',
    'handled'
  )),
  -- One short sentence for a human. Never a body, never a token.
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_deliveries_created_at on webhook_deliveries(created_at desc);
create index if not exists idx_webhook_deliveries_dealership on webhook_deliveries(dealership_id);
create index if not exists idx_webhook_deliveries_entry on webhook_deliveries(entry_id);

comment on table webhook_deliveries is
  'One row per Meta webhook entry received, including the ones that matched no business. Metadata only — never message text. Exists because auto_reply_log cannot record a delivery with no dealership (its dealership_id is NOT NULL), which made "did Meta ever call us" unanswerable while the auto-reply toggles were on and the log stayed empty.';

comment on column webhook_deliveries.outcome is
  'Which gate ended this delivery: signature_rejected (before parsing), no_entry_id, no_business_matched, no_reply_token, both_toggles_off, nothing_to_reply_to (matched and enabled, but the entry carried no message or comment for us), or handled.';

alter table webhook_deliveries enable row level security;

drop policy if exists "webhook_deliveries_owner_select" on webhook_deliveries;
create policy "webhook_deliveries_owner_select" on webhook_deliveries
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

drop policy if exists "webhook_deliveries_member_select" on webhook_deliveries;
create policy "webhook_deliveries_member_select" on webhook_deliveries
  for select using (
    dealership_id in (
      select dealership_id from team_members where user_id = auth.uid() and status = 'active'
    )
  );

-- NO INSERT, UPDATE OR DELETE POLICY. The webhook routes write through
-- the service role; nothing a client sends should be able to add a row
-- here, or the table stops being evidence.
--
-- AND A ROW WITH A NULL dealership_id IS READABLE BY NOBODY through
-- these policies — by design, and a stated limit rather than an
-- oversight. Such a row is about a page that belongs to no business
-- here, so there is no owner it could be shown to without showing one
-- business another's page id. They are read with the verify query
-- below, by hand.

-- ---- verify -----------------------------------------------------
--
--   select relname, relrowsecurity
--   from pg_class where relname = 'webhook_deliveries';
--
-- Expected: one row, relrowsecurity = t.
--
--   select polname, cmd from pg_policies
--   where tablename = 'webhook_deliveries' order by polname;
--
-- Expected: EXACTLY TWO rows, both SELECT.
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'webhook_deliveries' order by ordinal_position;
--
-- Expected: dealership_id is uuid and NULLABLE ("YES"). That is the
-- whole point of the table; if it comes back NO, the migration did not
-- apply as written.
--
--   select count(*) from webhook_deliveries;
--
-- Expected: 0 — nothing is recorded until the next webhook arrives.
--
-- ---- AND THE QUERY THAT ANSWERS THE ACTUAL BUG ------------------
--
-- Run this after sending ONE real Instagram or Facebook DM to the
-- connected account. It is the diagnosis, in one line:
--
--   select outcome, count(*), max(created_at) as last_seen, min(entry_id) as a_page_id
--   from webhook_deliveries
--   where created_at > now() - interval '1 hour'
--   group by outcome order by count(*) desc;
--
-- NO ROWS AT ALL means Meta never called: the Page is not subscribed to
-- the app, which nothing in this codebase has ever done.
-- 'signature_rejected' means FACEBOOK_APP_SECRET is wrong or unset.
-- 'no_business_matched' means the id Meta sent is not the one stored in
-- dealerships.fb_page_id / instagram_business_id — compare a_page_id
-- with what is stored.
-- 'no_reply_token' means the connection has no usable token.
-- 'both_toggles_off' means the switches are not actually on.
-- 'handled' means this file was never the problem.
