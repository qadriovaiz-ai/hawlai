-- The visitor who became this lead — V5a.
--
-- WHY NOTHING BEHAVIOURAL COULD EVER FIRE WITHOUT IT. A visitor's
-- behaviour lives on `page_events.visitor_id` — which page (V1, 228),
-- grouped into visits (V2), scored for intent (V3). A lead lives in
-- `leads`. THERE WAS NO JOIN BETWEEN THEM, so "start a follow-up
-- because of what they looked at" had nothing to stand on: the engine
-- can only email a lead, and no lead could be matched to any browsing.
--
-- `bridgeVisitorTouchpoints` already walks that gap once, at the moment
-- of capture, and copies the visitor's events into `touchpoints` — but
-- a touchpoint row carries a CHANNEL and a TIME, not a page. It answers
-- "where did they come from", never "what were they looking at", which
-- is the question V5 exists to act on. Keeping the id makes the
-- behaviour readable afterwards, which is what a sequence needs on day
-- 2 and day 5, not only on day 0.
--
-- ─────────────────────────────────────────────────────────────────────
-- NULL IS THE NORMAL CASE AND MUST STAY SAFE
-- ─────────────────────────────────────────────────────────────────────
--
-- `visitor_id` is withheld until a visitor accepts cookies (lib/utils),
-- by design. So a lead captured from somebody who declined has no id
-- here, and neither does a lead typed in by the owner, imported, or
-- arriving from Meta. NULL means "we cannot connect this person to any
-- browsing", which is NOT "they browsed nothing" — and a behavioural
-- trigger must stay silent for them rather than guess. That is the same
-- distinction `measuredSeconds` keeps for a visit that could not be
-- timed.
--
-- NOT UNIQUE, DELIBERATELY. One person can fill in a form twice, and
-- one browser is one visitor id — a unique constraint would make the
-- second capture fail outright, turning a privacy-friendly convenience
-- into a lost lead.
--
-- NOT AN IDENTIFIER OF A PERSON. It is a random per-browser string the
-- visitor consented to, stored so their own session can be recognised;
-- it is cleared when they clear site data, and it never leaves this
-- business's own rows.

alter table leads
  add column if not exists visitor_id text;

-- Behaviour is read BY visitor within one business, which is exactly
-- this pair. Partial, because the column is null for most rows and an
-- index over those nulls would be weight with nothing in it.
create index if not exists idx_leads_visitor
  on leads(dealership_id, visitor_id)
  where visitor_id is not null;

comment on column leads.visitor_id is
  'The consented browser id this lead was captured from, when there was one. NULL means the visitor declined cookies or the lead did not come from the site — never that they browsed nothing.';

-- VERIFY. Expected: one row — visitor_id | text | YES | (no default).
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name = 'leads' and column_name = 'visitor_id';
--
-- AND the index exists, partial:
-- Expected: one row whose indexdef ends with WHERE (visitor_id IS NOT NULL).
--
-- select indexname, indexdef from pg_indexes
-- where tablename = 'leads' and indexname = 'idx_leads_visitor';
--
-- AND no existing lead was touched. Expected: 0.
--
-- select count(*) from leads where visitor_id is not null;
