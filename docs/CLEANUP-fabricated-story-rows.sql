-- ────────────────────────────────────────────────────────────────────
-- CLEANUP: the fabricated Business Story answers on the test business
--
-- VERSION 2, 19 November 2026. VERSION 1 WOULD HAVE DELETED REAL
-- FACTS, and the only thing that stopped it was its own step 2b.
--
-- DRAFT FOR REVIEW. Nothing here has been run.
-- ────────────────────────────────────────────────────────────────────
--
-- WHAT VERSION 1 GOT WRONG, AND WHY
--
-- It scoped the delete to `category = 'business_story'` on the strength
-- of a code comment saying "migration 209 moved nine rows out of
-- business_story and into general".
--
--   * Migration 209 is `action_levels.sql`. It has nothing to do with
--     business_knowledge. The move was never a migration at all — it
--     was a manual data change planned on 15 October.
--   * And it never happened. Step 2b returned NO ROWS: that business
--     has no `general` rows whatsoever. Every row is still filed under
--     `business_story`, the product facts among them.
--
-- So a delete on that category would have taken "paraffin-free, soy
-- wax only", "hand-poured in small batches", the Instagram handle and
-- the bulk-order note along with the invented stories.
--
-- THE FACTS ARE WORKING WHERE THEY ARE. `FACT_CATEGORIES` in
-- lib/business/businessStory.ts contains BOTH `business_story` and
-- `general`, so a fact filed under the story category is already read
-- as a fact and already prints uncapped. The move was for tidiness.
-- Nothing is broken by leaving them; everything breaks by deleting
-- them.
--
-- ────────────────────────────────────────────────────────────────────
-- WHAT TELLS A STORY ROW FROM A FACT ROW: THE TITLE
-- ────────────────────────────────────────────────────────────────────
--
-- `save_business_story` is the ONLY writer that sets
-- category = 'business_story' (masterBrainV2.ts), and it always writes
-- `question.title` — one of exactly ten fixed titles from
-- STORY_QUESTIONS. Anything else under that category was typed by hand
-- through the Business Knowledge page.
--
-- "Something I can stand behind" is not one of the ten. That is why
-- those four rows are facts and not intake answers, and it is the
-- distinction this version keys on instead of the category.


-- ────────────────────────────────────────────────────────────────────
-- HOW TO RUN THIS — ONE SCRIPT, ONE RUN, PER TRANSACTION
-- ────────────────────────────────────────────────────────────────────
--
-- LEARNED THE HARD WAY ON 19 NOVEMBER 2026. The Supabase SQL editor
-- appears to open a NEW CONNECTION for every Run. Version 2 of this
-- file ended each transaction with a commented-out `commit;`, expecting
-- it to be run separately after reading the verify-select. That second
-- Run was a different session, so the transaction was silently rolled
-- back: it looked done and was not.
--
-- So each `begin` below ends with its own `commit` IN THE SAME BLOCK,
-- and the check that would have been eyeballed is now a `do $$` that
-- RAISES. An exception aborts the transaction, so `commit` never runs
-- and nothing changed — the expectation is stated in SQL instead of
-- being left to a person comparing numbers across two Runs.
--
-- Steps 1 and 2 are read-only and safe to run on their own.

-- ────────────────────────────────────────────────────────────────────
-- STEP 1 — FIND THE BUSINESS. Do not guess the id.
-- ────────────────────────────────────────────────────────────────────
-- Expected: one row. If it returns two, or none, STOP.

select d.id, d.dealership_name, w.slug, d.created_at
from dealerships d
left join websites w on w.dealership_id = d.id
where w.slug = 'candle_by_qaaf'
   or lower(d.dealership_name) like '%qaaf%'
order by d.created_at;


-- ────────────────────────────────────────────────────────────────────
-- STEP 2 — EVERY ROW, SORTED INTO THE TWO KINDS
-- ────────────────────────────────────────────────────────────────────
--
-- Replace :business_id with the UUID from step 1, in quotes. The
-- Supabase editor does not bind :names.
--
-- `kind` is computed from the title against the ten intake titles.
-- READ THE CONTENT COLUMN OF EVERY ROW. The title is strong evidence,
-- not proof — an intake answer could still hold a fact, and if one
-- does, treat it as a fact and keep it.

select
  id,
  case when title in (
    'How it started',
    'The first customers',
    'How it''s made, step by step',
    'The part that takes longest',
    'Materials and suppliers',
    'The detail people notice',
    'What a customer actually said',
    'What you refuse to do',
    'How you talk about the work',
    'What people get wrong'
  ) then 'intake story — candidate to delete'
       else 'hand-typed — KEEP' end as kind,
  title,
  category,
  is_active,
  length(content) as chars,
  content
from business_knowledge
where dealership_id = :business_id
order by kind, title;


-- ────────────────────────────────────────────────────────────────────
-- STEP 3 — MOVE THE FACTS TO `general` FIRST
-- ────────────────────────────────────────────────────────────────────
--
-- This is the move that was planned on 15 October and never made. It
-- changes no behaviour — both categories already count as facts — but
-- it puts the hand-typed rows somewhere a story cleanup cannot reach,
-- now or the next time somebody writes one.
--
-- DO THIS BEFORE STEP 4, and check the count it reports.

begin;

update business_knowledge
set category = 'general', updated_at = now()
where dealership_id = :business_id
  and category = 'business_story'
  and title not in (
    'How it started',
    'The first customers',
    'How it''s made, step by step',
    'The part that takes longest',
    'Materials and suppliers',
    'The detail people notice',
    'What a customer actually said',
    'What you refuse to do',
    'How you talk about the work',
    'What people get wrong'
  );

-- THE CHECK IS INSIDE THE TRANSACTION. Replace 4 with the number of
-- hand-typed rows step 2 showed. If it does not match, this raises,
-- the transaction aborts, and the commit below never happens.
do $$
declare moved int;
begin
  select count(*) into moved from business_knowledge
   where dealership_id = :business_id and category = 'general';
  if moved <> 4 then
    raise exception 'expected 4 rows in general after the move, found %', moved;
  end if;
end $$;

commit;


-- ────────────────────────────────────────────────────────────────────
-- STEP 4 — DELETE ONLY THE INTAKE ANSWERS
-- ────────────────────────────────────────────────────────────────────
--
-- Run only after step 3 is committed AND step 2's content column has
-- been read. By now `business_story` holds nothing but intake answers,
-- so the category scope is finally safe — but the title list is kept
-- as well, because two guards cost nothing and this is deletion.

begin;

delete from business_knowledge
where dealership_id = :business_id
  and category = 'business_story'
  and title in (
    'How it started',
    'The first customers',
    'How it''s made, step by step',
    'The part that takes longest',
    'Materials and suppliers',
    'The detail people notice',
    'What a customer actually said',
    'What you refuse to do',
    'How you talk about the work',
    'What people get wrong'
  );

-- SAME SHAPE: the expectation is asserted, not eyeballed. No story
-- rows may remain, and the facts moved in step 3 must still be there.
do $$
declare stories int; facts int;
begin
  select count(*) into stories from business_knowledge
   where dealership_id = :business_id and category = 'business_story';
  select count(*) into facts from business_knowledge
   where dealership_id = :business_id and category = 'general';
  if stories <> 0 then
    raise exception 'expected no story rows left, found %', stories;
  end if;
  if facts <> 4 then
    raise exception 'the facts changed count: expected 4, found %', facts;
  end if;
end $$;

commit;


-- ────────────────────────────────────────────────────────────────────
-- AFTERWARDS
-- ────────────────────────────────────────────────────────────────────
--
-- The ten Business Story questions become unanswered, which is the
-- correct state: nobody has answered them. Master Chat offers them
-- again in the normal way, and the first real business to answer them
-- will be the first whose story is its own.
--
-- The facts are untouched and still read as facts — they have simply
-- moved to the category that was always meant to hold them.
