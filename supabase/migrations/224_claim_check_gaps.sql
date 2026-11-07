-- ============================================================
-- Which fact was missing, not just how many were
-- ============================================================
-- I6 of docs/PLAN-AUTO-INTERVIEW.md — Tier 3, the part that removes the
-- person from the loop. When a generator reaches for a fact the business
-- has not recorded, the question goes to the owner instead of the
-- sentence being quietly deleted.
--
-- WHAT WAS ALREADY THERE, AND WHERE IT STOPPED. `claim_checks`
-- (migration 217) records `claims_removed` — an INTEGER. How many
-- claims the guard took out of an output, never which. So the product
-- has always known that it wanted to say something it could not
-- support, and has never been able to say WHAT.
--
-- AND THE INFORMATION ALREADY EXISTS ONE FUNCTION EARLIER.
-- claimCheck.ts's internal `Problem` type carries
-- `kind: "price" | "claim" | "substantiation"` on every removal, and
-- `stripUnsupported` flattens it to a list of sentences before any
-- caller sees it. I6 carries that kind through and stores it here, so
-- "the owner has never told us a price" becomes a countable fact rather
-- than a guess.
--
-- WHY A jsonb ARRAY RATHER THAN A SECOND TABLE. One row per output
-- already exists; this is a property of that output, not an entity of
-- its own. A join table would mean a second place for the same event to
-- disagree about itself.
--
-- WHAT IS NOT STORED, DELIBERATELY: the removed SENTENCES. The reason
-- text quotes the copy the generator wrote, and `claim_checks.text`
-- already raised a retention question that migration 217 flagged and
-- nobody has answered. Tier 3 needs the KIND, not the words — so only
-- the kind is kept, and the question asked of the owner is written from
-- the interview registry rather than from the model's sentence.
--
-- RUN BY HAND, as every migration here is.

alter table claim_checks
  add column if not exists removed_kinds jsonb not null default '[]'::jsonb;

comment on column claim_checks.removed_kinds is
  'What KINDS of claim the guard removed from this output — a jsonb array of claimCheck.ts''s own Problem kinds (price | claim | substantiation), one entry per removal. claims_removed stays the count. The removed sentences are deliberately NOT stored: Tier 3 needs the kind, and the question put to the owner is written from the interview registry, not from the model''s wording. I6 of PLAN-AUTO-INTERVIEW.md.';

-- ---- verify -----------------------------------------------------
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'claim_checks' and column_name = 'removed_kinds';
--
-- Expected: one row — jsonb / NO / '[]'::jsonb.
--
--   select count(*) as rows, count(*) filter (where removed_kinds = '[]'::jsonb) as empty
--   from claim_checks;
--
-- Expected: the two numbers are EQUAL. Every row that existed before
-- this column was added has an empty array, because nothing recorded a
-- kind until now — and an empty array means "not recorded", which is
-- what Tier 3 must read it as. It does NOT mean "nothing was removed":
-- claims_removed is where that is stated.
