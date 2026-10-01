-- 207: one batch for four separate pieces of work.
--
-- Batched because each is a single additive column or a widened CHECK,
-- and running five statements by hand beats running five migrations.
-- Nothing here changes an existing value.
--
-- ─────────────────────────────────────────────────────────────────────
-- 1. page_events.is_internal — the owner's own visits.
--
-- Site visits went 28 → 31 while the owner was testing his own site. At
-- that traffic level his own clicks are most of the signal, and
-- Diagnosis reads these rows for the funnel and the conversion rate.
--
-- MARKED, NOT DROPPED. Refusing to record the event would make "why
-- didn't my visit count?" unanswerable and the exclusion impossible to
-- audit. The row is kept and left out of every count.
alter table page_events
  add column if not exists is_internal boolean not null default false;

comment on column page_events.is_internal is
  'True when this event came from the owner or their staff rather than a customer — detected from their logged-in session, or from the hw=owner cookie the dashboard sets on its View site link. Excluded from every visitor count and from Diagnosis.';

create index if not exists idx_page_events_visitor_only
  on page_events(dealership_id, created_at desc) where is_internal = false;

-- ─────────────────────────────────────────────────────────────────────
-- 2. pending_approvals.status — 'expired'.
--
-- Approvals sit pending forever. One card on this account has been
-- waiting since September; staleApprovalDetection NOTIFIES after a few
-- hours and nothing ever closes the row.
--
-- The CHECK from migration 006 allows ('pending','approved','rejected')
-- only, so writing 'expired' would fail exactly the way platform =
-- 'hawlai_site' failed on publish_actions. publish_actions.status
-- already allows 'stale' (migration 170), so that side needs nothing.
alter table pending_approvals drop constraint if exists pending_approvals_status_check;

alter table pending_approvals
  add constraint pending_approvals_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired'));

comment on column pending_approvals.status is
  'pending | approved | rejected | expired (nobody decided within 14 days; its publish action is marked stale and the card renders as closed).';

-- ─────────────────────────────────────────────────────────────────────
-- 3. dealerships.claims_reviewed_at — the gate on the evidence rule.
--
-- Stage 2: once an owner has been through the claims on their own site
-- and kept, edited or removed each one, machine-written text stops
-- counting as evidence for THAT business. Before they have, it must keep
-- counting — otherwise their existing copy would be stripped on the next
-- generation with no warning and no way to put it back.
alter table dealerships
  add column if not exists claims_reviewed_at timestamptz;

comment on column dealerships.claims_reviewed_at is
  'When the owner finished the "Claims on your site" review. Null means they have not, and generated site text still counts as evidence for their claims check.';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Watch limits — paused, never deleted.
--
-- Competitor and topic monitors run a searching Claude call every night
-- per watch, whether or not anyone reads the result, and that is the
-- largest recurring per-business cost in the product. The plan caps are
-- Free 0 / Basic 0 / Pro 1 / Max 3.
--
-- A watch over the cap is PAUSED, not removed: the owner typed that
-- competitor's name and deleting it on a plan change would lose their
-- work silently. A paused watch costs nothing and comes back if they
-- upgrade.
alter table competitor_watches
  add column if not exists paused boolean not null default false;

alter table topic_watches
  add column if not exists paused boolean not null default false;

comment on column competitor_watches.paused is
  'True when this watch is over the plan''s limit. Kept, not deleted: the nightly check skips it and the card says why.';

comment on column topic_watches.paused is
  'True when this watch is over the plan''s limit. Kept, not deleted: the nightly check skips it and the card says why.';
