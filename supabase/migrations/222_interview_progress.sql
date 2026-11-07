-- ============================================================
-- A half-finished interview that says it is half-finished
-- ============================================================
-- I5 of docs/PLAN-AUTO-INTERVIEW.md, and it carries the gap I3 left in
-- writing rather than in a comment: the `weak` flag had nowhere to live.
--
-- THE FAILURE THIS EXISTS TO PREVENT, and it is §2.1 of that plan: a
-- half-filled record LOOKS COMPLETE to a generator. `knownText` reads
-- what is in `business_knowledge` and has no way to know what the owner
-- never reached. Six answers out of nine, abandoned, are read as the
-- whole truth about a business — and the gaps are exactly where a model
-- invents, because that is what a model does with a gap.
--
-- So two things are recorded here:
--
--   1. WHICH QUESTIONS HAVE BEEN ANSWERED, as rows that exist
--      independently of the answers themselves. Four of nine is then a
--      fact the facts layer can state, rather than something nobody can
--      compute.
--   2. WHETHER AN ANSWER IS THIN, decided by judgeAnswer
--      (lib/onboarding/answerCheck.ts) and recorded next to the text it
--      qualifies.
--
-- WHY THE ANSWER TEXT IS NOT IN HERE. It is already in
-- `business_knowledge` (a note) or `business_listing_facts` (a column).
-- A third home for the same sentence is how two copies of one fact come
-- to disagree — the mistake this codebase has now extracted three times
-- in a week (provenance.ts's TEXT_PROPS, offerPromises.ts, and
-- noteShape.ts's 200). This table holds STATUS, not content.
--
-- RUN BY HAND, as every migration here is.

-- ---- 1. the flag, beside the text it qualifies -------------------
--
-- ON business_knowledge, NOT on the progress table, and that is the
-- decision. The flag qualifies a sentence a generator will read, so it
-- has to be readable in the same row as the sentence. Keeping it on the
-- progress table would mean joining note titles to question keys — and
-- a title is the owner's to edit, so it is the wrong thing to key a
-- join on.
--
-- DEFAULT false, so every row that already exists is "not known to be
-- thin" rather than silently flagged. Nothing has judged them.

alter table business_knowledge
  add column if not exists is_weak boolean not null default false;

comment on column business_knowledge.is_weak is
  'The interview asked for something checkable, the owner answered twice without one, and the answer was stored anyway (the founder''s decision of 7 Nov 2026: store and flag, never block). Generators are told the note is thin rather than being handed it as a fact. Decided by judgeAnswer in lib/onboarding/answerCheck.ts.';

-- ---- 2. which questions have been asked and answered ------------

create table if not exists interview_answers (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- The registry's key (lib/onboarding/interview.ts). NOT a foreign key
  -- to anything: the questions are code, and migration 170's reasoning
  -- is reused rather than re-argued — the policy moves faster than
  -- migrations, and a mismatch is caught by a test rather than by a
  -- failed insert at the worst possible moment.
  --
  -- A KEY HERE MAY NEVER BE RENAMED IN THE REGISTRY. These rows are
  -- what "asked once, ever" is read from (the founder's decision of
  -- 7 November), so a rename re-asks a question the owner has already
  -- answered. The registry says so above the field.
  question_key text not null,

  -- answered  the owner gave something and it was stored
  -- skipped   the owner declined this one; it is not asked again by the
  --           interview, and it is NOT an answer
  -- asked     Tier 3 raised it and is waiting. The row exists so the
  --           same question is not raised a second time.
  --
  -- NO CHECK CONSTRAINT, same reasoning as question_key.
  status text not null default 'answered',

  -- How many times the owner has answered THIS question. The follow-up
  -- is asked once (attempt 1 → a follow-up; attempt 2 → stored and
  -- flagged), so this is what decides which.
  attempts integer not null default 1,

  -- Whether the stored answer was thin. Mirrors business_knowledge.is_weak
  -- for a question whose answer is a COLUMN rather than a note, where
  -- there is no row to carry it.
  weak boolean not null default false,

  -- When Tier 3 raised it, and when it was answered. Separate, because
  -- "asked three weeks ago and never answered" is the thing a product
  -- should notice and a single timestamp cannot say.
  asked_at timestamptz,
  answered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ONE ROW PER QUESTION PER BUSINESS. A second row would be a second
  -- answer to "has this been asked", and the asked-once rule would have
  -- nothing to read.
  unique (dealership_id, question_key)
);

create index if not exists idx_interview_answers_dealership_id
  on interview_answers(dealership_id);

comment on table interview_answers is
  'Which interview questions this business has been asked and answered — status, not content. The answers live in business_knowledge and business_listing_facts; a third home for the same sentence is how two copies of one fact come to disagree. I5 of PLAN-AUTO-INTERVIEW.md.';

comment on column interview_answers.status is
  'answered | skipped | asked. "skipped" is the owner declining, which is not an answer and is not asked again. "asked" is Tier 3 waiting, and the row existing is what stops the same question being raised twice.';

comment on column interview_answers.question_key is
  'The registry key from lib/onboarding/interview.ts. Renaming one there re-asks a question the owner has already answered.';

-- ---- RLS --------------------------------------------------------
--
-- business_knowledge's own policy (118) is `for all` to the owner, and
-- this table follows the pattern migrations 148 and 221 use: the owner
-- reads, an active team member reads, and nothing writes from a client.
-- Writes go through /api/interview, which resolves the business from the
-- caller's own session before the service client touches a row.

alter table interview_answers enable row level security;

drop policy if exists "interview_answers_owner_select" on interview_answers;
create policy "interview_answers_owner_select" on interview_answers
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

drop policy if exists "interview_answers_member_select" on interview_answers;
create policy "interview_answers_member_select" on interview_answers
  for select using (
    dealership_id in (
      select dealership_id from team_members where user_id = auth.uid() and status = 'active'
    )
  );

-- ---- verify -----------------------------------------------------
--
-- Run these after the migration.
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'business_knowledge' and column_name = 'is_weak';
--
-- Expected: one row, boolean, default false.
--
--   select relname, relrowsecurity
--   from pg_class where relname = 'interview_answers';
--
-- Expected: relrowsecurity = t.
--
--   select polname, cmd from pg_policies
--   where tablename = 'interview_answers' order by polname;
--
-- Expected: exactly two SELECT policies —
-- interview_answers_member_select and interview_answers_owner_select,
-- and no insert/update/delete policy at all.
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'interview_answers'::regclass and contype = 'u';
--
-- Expected: UNIQUE (dealership_id, question_key).
