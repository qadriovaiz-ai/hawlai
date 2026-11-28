-- 246: the UPI ID check that could never pass — 28 November 2026.
--
-- THE BUG, found by the founder's first live save: "invalid regular
-- expression: invalid repetition count(s)". Migration 242's CHECK used
-- `{2,256}`, and PostgreSQL's regex engine caps a repetition bound at 255
-- (RE_DUP_MAX). Postgres compiles a constraint's regex when it is USED,
-- not when the constraint is created — so 242 ran cleanly, and EVERY
-- non-null UPI ID was then refused with that error. No UPI ID was ever
-- saved (the founder confirmed: zero rows).
--
-- Why 242's own verification missed it: it checked that the constraint
-- EXISTED, and a no-match UPDATE proved nothing (recorded in DECISIONS on
-- the day). This file's verification ACTUALLY WRITES a UPI ID, inside a
-- block that always rolls back.
--
-- THE FIX: no large repetition count at all. The length cap moves out of
-- the regex into char_length, and the regex keeps only small bounds:
--
--   char_length(seller_upi_vpa) <= 255
--   and seller_upi_vpa ~ '^[a-z0-9._-]{2,}@[a-z][a-z0-9]{1,63}$'
--
-- The app (src/lib/dm/sellerMode.ts) checks the same two things, and a
-- test holds the regexes identical and every repetition count in every
-- migration's regex at 255 or less.
--
-- ---- BEFORE RUNNING, against the LIVE database -------------------------
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'dealerships_seller_upi_vpa_format';
--   -- Expected: the {2,256} version from 242. Anything else — stop, paste it.
--
--   select count(*) from dealerships where seller_upi_vpa is not null;
--   -- Expected: 0 (none could ever be saved).
--
-- RUN BY HAND, as every migration here is.

alter table dealerships drop constraint if exists dealerships_seller_upi_vpa_format;
alter table dealerships add constraint dealerships_seller_upi_vpa_format
  check (
    seller_upi_vpa is null
    or (char_length(seller_upi_vpa) <= 255 and seller_upi_vpa ~ '^[a-z0-9._-]{2,}@[a-z][a-z0-9]{1,63}$')
  );

-- ---- VERIFY, after running ------------------------------------------------
--
-- 1. The definition:
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'dealerships_seller_upi_vpa_format';
--   -- Expected: contains char_length(seller_upi_vpa) <= 255 and {2,}
--
-- 2. THAT IT REALLY ACCEPTS A GOOD UPI ID AND REFUSES A BAD ONE. One Run.
--    It writes to one existing business and then ALWAYS rolls back by
--    raising at the end — nothing is kept:
--
--   do $$
--   declare d uuid := (select id from dealerships order by created_at limit 1);
--   begin
--     update dealerships set seller_upi_vpa = 'test.check@okhdfcbank' where id = d;
--     begin
--       update dealerships set seller_upi_vpa = 'not a upi id' where id = d;
--       raise exception 'FAILED: a bad UPI ID was accepted';
--     exception when check_violation then null;
--     end;
--     raise exception 'VERIFIED: a good UPI ID saves, a bad one is refused (rolled back, nothing kept)';
--   end $$;
--
--   -- Expected: an ERROR whose message is exactly
--   --   VERIFIED: a good UPI ID saves, a bad one is refused (rolled back, nothing kept)
--   -- Any other message (above all "invalid regular expression") — paste it.
--
--   select count(*) from dealerships where seller_upi_vpa is not null;
--   -- Expected: still 0 — the check above kept nothing.
