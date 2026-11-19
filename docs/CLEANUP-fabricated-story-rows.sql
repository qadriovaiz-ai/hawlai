-- ────────────────────────────────────────────────────────────────────
-- CLEANUP: the fabricated Business Story answers on the test business
--
-- DRAFT FOR REVIEW. Nothing here has been run. Read step 1 and step 2
-- before running step 3 — step 2 is what tells you whether step 3 is
-- deleting the right five rows or the wrong fourteen.
--
-- NOT A MIGRATION, AND DELIBERATELY NOT IN supabase/migrations/. That
-- directory is the schema, and every file in it runs against every new
-- environment. This is a one-off data fix for ONE tenant's rows, and a
-- fresh database has nothing to fix.
-- ────────────────────────────────────────────────────────────────────
--
-- WHY. candle_by_qaaf is test data — no real business has used Hawlai
-- yet (founder's note, 7 November 2026). Its Business Story answers
-- were written to exercise the intake flow, not by a shopkeeper about
-- a real shop, and they read as a real person's account of starting a
-- real business. They are the one kind of test data that must not
-- survive into a pilot: `personalStories.ts` gates them on consent and
-- `claimCheck` lets them through as the owner's own words, so an
-- invented origin story can be printed in customer-facing copy as if
-- the founder had said it.
--
-- WHAT MUST SURVIVE, AND THIS IS THE PART TO BE CAREFUL ABOUT.
-- Migration 209 moved NINE rows out of `business_story` and into
-- `general` because they hold PRODUCT FACTS — the double-boiler step,
-- the fragrance timing, "paraffin-free, soy wax only". Those are real
-- and they are what product claims are built from. They are no longer
-- in the story category, so the delete below cannot reach them, and
-- step 2 is there to prove that before anything is removed.


-- ────────────────────────────────────────────────────────────────────
-- STEP 1 — FIND THE BUSINESS. Do not skip this and do not guess the id.
-- ────────────────────────────────────────────────────────────────────
--
-- A slug is not an id, and this codebase has been bitten by keying SQL
-- on a guessed one. Run this, read the result, and use the id it gives
-- you in steps 2 and 3.
--
-- Expected: one row. If it returns two, or none, STOP — the name is
-- not identifying what you think it is.

select d.id, d.dealership_name, w.slug, d.created_at
from dealerships d
left join websites w on w.dealership_id = d.id
where w.slug = 'candle_by_qaaf'
   or lower(d.dealership_name) like '%qaaf%'
order by d.created_at;


-- ────────────────────────────────────────────────────────────────────
-- STEP 2 — READ WHAT WOULD GO, AND WHAT WOULD STAY
-- ────────────────────────────────────────────────────────────────────
--
-- Paste the id from step 1 in place of :business_id in BOTH queries.
--
-- 2a. The rows step 3 would delete. Read the content column — every
--     one of these should be a story a person would tell, and none of
--     them should be a product fact. If any row here looks like a
--     fact about the candles rather than about the business's history,
--     STOP and move it to `general` instead of deleting it.

select id, title, category, is_active, length(content) as chars, content
from business_knowledge
where dealership_id = :business_id
  and category = 'business_story'
order by title;

-- 2b. The rows that must SURVIVE — migration 209's nine product facts.
--     Expected: these are all `general`, and step 3 does not touch
--     them. If this returns nothing, migration 209 did not run here
--     and the facts may still be sitting in `business_story`, where
--     step 3 WOULD delete them. In that case do not run step 3.

select id, title, category, length(content) as chars, left(content, 80) as starts
from business_knowledge
where dealership_id = :business_id
  and category <> 'business_story'
order by category, title;


-- ────────────────────────────────────────────────────────────────────
-- STEP 3 — DELETE, INSIDE A TRANSACTION
-- ────────────────────────────────────────────────────────────────────
--
-- Run it as written. The select before the commit shows what the table
-- looks like with the delete applied but not yet saved: if the count
-- is not what step 2a led you to expect, type `rollback;` instead of
-- `commit;` and nothing has happened.
--
-- SCOPED THREE WAYS: to one dealership, to one category, and inside a
-- transaction. An unscoped delete on this table would take every
-- business's knowledge with it.

begin;

delete from business_knowledge
where dealership_id = :business_id
  and category = 'business_story';

-- Expected: 0 rows in the story category, and the `general` rows from
-- step 2b still present and unchanged.
select category, count(*) as rows
from business_knowledge
where dealership_id = :business_id
group by category
order by category;

-- commit;
-- rollback;


-- ────────────────────────────────────────────────────────────────────
-- AFTERWARDS
-- ────────────────────────────────────────────────────────────────────
--
-- The Business Story questions become unanswered again, which is the
-- correct state: nobody has answered them. Master Chat will offer them
-- in the normal way (`business_story` lists the open ones), and the
-- first real business to answer them will be the first business whose
-- story is its own.
--
-- Nothing else holds these rows. The story answers live only in
-- business_knowledge — masterBrainV2's save_business_story writes
-- there and nowhere else — so there is no second copy to clear and no
-- foreign key left pointing at nothing.
