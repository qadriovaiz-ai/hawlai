-- What we think the answer is, before the owner has said — D1.
--
-- The three-bucket onboarding: discover what a site can tell us, show
-- it as a pre-filled draft, and only ASK the questions nobody writes
-- down. These three columns are where a draft lives between those two
-- halves.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY HERE, AND NOT IN business_knowledge
-- ─────────────────────────────────────────────────────────────────────
--
-- THIS IS THE WHOLE SAFETY PROPERTY, so it is written down rather than
-- assumed. `gatherBusinessFacts` reads `business_knowledge` and
-- `business_listing_facts`. Those two tables are what every generator,
-- every chat reply and every published page is checked against.
--
-- A suggestion we found on a website is NOT a fact about the business —
-- it is a sentence a page makes. If it were written into either of
-- those tables it would become, instantly and silently, something the
-- claims layer treats as verified truth and the sales agent repeats to
-- a customer. So it is kept here, in the table that already records the
-- STATE of each question, and nothing in the facts layer reads this
-- table at all.
--
-- The consequence is the point: an unconfirmed suggestion cannot reach
-- a customer even if every other guard failed, because `stripUnsupported`
-- will delete it as unsupported — there is genuinely no record behind
-- it. That is the existing guarantee doing the work, not a new guard
-- standing beside it.
--
-- ─────────────────────────────────────────────────────────────────────
-- FOUR STATES, TWO COLUMNS
-- ─────────────────────────────────────────────────────────────────────
--
-- discovered / inferred is an ORIGIN. suggested / answered / rejected /
-- skipped is a DECISION. One column cannot hold both, and collapsing
-- them is how "he confirmed something we found" and "he told us"
-- become the same fact.
--
--   source   | status      | what it means
--   ---------+-------------+------------------------------------------
--   (none)   | (no row)    | nobody has looked at this question
--   discovered| suggested  | a page says this; the owner has not seen it
--   inferred | suggested   | we worked it out; the owner has not seen it
--   discovered| answered   | the owner confirmed something we found
--   owner    | answered    | the owner told us, unprompted
--   discovered| rejected   | the owner saw our suggestion and said no
--   any      | skipped     | the owner declined the question itself
--
-- `source` IS NEVER OVERWRITTEN ON CONFIRMATION. A confirmed discovery
-- still reads `discovered` forever, which is what lets anyone later ask
-- how many of a business's recorded facts began as a guess.
--
-- `rejected` IS NOT `skipped`. Skipped means "don't ask me this".
-- Rejected means "that particular suggestion is wrong" — the question
-- is still worth asking properly.

alter table interview_answers
  -- owner | discovered | inferred.
  --
  -- NO CHECK CONSTRAINT, reusing migration 170's reasoning as 217 and
  -- 222 did: the vocabulary is code and moves faster than migrations,
  -- and a mismatch belongs in a test rather than in a failed insert at
  -- the worst possible moment.
  --
  -- NULL on every existing row, and that is correct: those answers were
  -- all typed by the owner before discovery existed, but writing
  -- 'owner' across them would be this migration asserting something it
  -- cannot know about rows it did not see. Null reads as "not
  -- recorded", which is the truth.
  add column if not exists source text,

  -- What we think the answer is. NOT an answer: the answer, once
  -- confirmed, is written to business_knowledge or
  -- business_listing_facts like any other, and this column is cleared.
  add column if not exists suggested_value text,

  -- Where it came from: { source_kind, url, quote }.
  --
  -- THE QUOTE IS NOT DECORATION. Without it the owner is being asked to
  -- confirm something with no way to check it, which is the friction
  -- this feature exists to remove — and it is the only thing that makes
  -- a wrong suggestion diagnosable afterwards.
  add column if not exists evidence jsonb;

comment on column interview_answers.source is
  'owner | discovered | inferred — where the answer ORIGINATED. Never overwritten when the owner confirms, so a confirmed discovery still reads discovered. NULL on rows written before D1.';

comment on column interview_answers.suggested_value is
  'What we think the answer is, while status = suggested. NOT a fact: nothing in the facts layer reads this column, which is what stops an unconfirmed guess reaching a customer.';

comment on column interview_answers.evidence is
  'Where a suggestion came from: { source_kind, url, quote }. The quote is what lets the owner check it in one glance.';

-- The status comment from 222 is now out of date; it listed three.
comment on column interview_answers.status is
  'answered | skipped | asked | suggested | rejected. "skipped" is the owner declining the question and it is not asked again. "asked" is Tier 3 waiting. "suggested" is a draft the owner has not seen yet and is NOT an answer. "rejected" is the owner saying a suggestion is wrong, which leaves the question still worth asking.';

-- VERIFY. Expected: three rows — source | text | YES, suggested_value |
-- text | YES, evidence | jsonb | YES.
--
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'interview_answers'
--   and column_name in ('source', 'suggested_value', 'evidence')
-- order by column_name;
--
-- AND: no existing answer was touched or reclassified. Expected: 0, 0.
--
-- select count(*) from interview_answers where source is not null;
-- select count(*) from interview_answers where status in ('suggested', 'rejected');
