-- ============================================================
-- A real idempotency key for /api/email/send.
--
-- APPLIED BY HAND on 2026-10-09 and verified before this file existed;
-- re-declared here with IF NOT EXISTS so the repo matches the live
-- schema and a fresh database gets it. Same pattern as migration 182.
--
-- Verified live: has_key_col 1, has_state_col 1, has_unique_index 1,
-- has_state_check 1, unresolved 0, total 8, and the index predicate is
-- partial on BOTH conditions.
--
-- WHY THE EXISTING CHECK WAS NOT ENOUGH. Phase 2B shipped a 5-minute
-- duplicate-suppression window over this table and said plainly what it
-- was not: not a key, and not atomic. The reason it could never be
-- atomic was in sendDealerEmail — the email_sends row was inserted
-- AFTER the send returned success. At the instant two requests race the
-- row does not exist yet, so no unique constraint on this table could
-- have prevented anything.
--
-- So the row becomes a CLAIM, written BEFORE the send, keyed on a
-- request id the client generates once per composed email. A retry
-- reuses the id and loses the insert; a deliberate second send is a new
-- press with a new id and goes through. That is the distinction a
-- content hash cannot make, which is why the window stays as a belt for
-- callers that send no key.
--
-- Checked against the LIVE schema first (15 columns, 3 indexes, 3
-- constraints, 8 rows) rather than against this repo's migrations, which
-- have drifted from production before.
-- ============================================================

-- The client's request id. One per composed email; a retry reuses it.
alter table email_sends add column if not exists idempotency_key text;

-- WHY handoff_state AND NOT send_state: this table already has
-- delivery_status, written only by resendWebhook.ts from Resend's own
-- events, and null forever on every Gmail send because it is keyed on
-- resend_message_id. That column answers "what did the recipient's mail
-- server do with it". This one answers "did Hawlai hand it off at all",
-- for every send, from Hawlai's own code. Two columns a reader could
-- mistake for each other, one of them null-by-design for half the rows,
-- is a future bug — so the name says whose side of the boundary it is.
alter table email_sends add column if not exists handoff_state text;

alter table email_sends drop constraint if exists email_sends_handoff_state_check;
alter table email_sends add constraint email_sends_handoff_state_check
  check (handoff_state is null or handoff_state in ('claimed', 'sent', 'failed'));

-- THE KEY. Partial, for two separate reasons:
--
--   idempotency_key is not null
--     Every row written before this migration has a null key, and so
--     does every row written by a caller that sends no key. Null keys
--     must not collide with each other.
--
--   handoff_state is distinct from 'failed'
--     A failed send must not block the retry of itself. Taking the
--     failed row out of the index unblocks the same request id without
--     deleting anything — which is why there is no "delete the claim on
--     failure" step anywhere in this design. A delete can fail; an
--     index predicate cannot, and the failed row stays on record where
--     it can be diagnosed.
--     `is distinct from` and not `<>`: `<> 'failed'` evaluates to NULL
--     for a null state, which would silently drop those rows from the
--     index.
create unique index if not exists uq_email_sends_idempotency
  on email_sends (dealership_id, idempotency_key)
  where idempotency_key is not null and handoff_state is distinct from 'failed';

-- The 8 existing rows are historical sends that DID succeed — the old
-- insert only ran on success. 8 rows, so a plain update.
update email_sends set handoff_state = 'sent' where handoff_state is null;

-- READ THIS BEFORE TRUSTING THE BACKFILL. It does NOT make null
-- impossible. Any caller that sends no idempotency key still takes the
-- old insert-after-success path, so null keeps appearing — and those
-- rows are successful sends. Null therefore means SENT, permanently,
-- and api/email/stats counts it (src/lib/email/sendClaim.ts
-- countsAsSent). Only 'claimed' and 'failed' are excluded from send
-- volume. The backfill makes the eight historical rows explicit; the
-- code rule is what keeps the numbers right.

comment on column email_sends.idempotency_key is
  'Client-supplied request id, one per composed email. Unique per business while the send has not failed. A retry reuses it and is refused.';
comment on column email_sends.handoff_state is
  'Hawlai''s own side of the send: claimed (written before the send) -> sent | failed. NULL means sent, written by a path that only inserts after success. Not delivery_status, which is Resend''s verdict and is null for every Gmail send.';
