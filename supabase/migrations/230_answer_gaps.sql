-- What a customer asked that your records could not answer — V4c.
--
-- WHY THIS IS THE MOST VALUABLE ROW IN THE ENGINE. Every other gap this
-- product finds is one the product went looking for: a generator
-- reached for a price, the guard removed it, Tier 3 asks about it
-- (claim_checks.removed_kinds, migration 224). This is a REAL CUSTOMER
-- wanting to know something, at the moment they wanted it, and the
-- business having nothing on record to tell them. That is a fact about
-- the business measured by the market rather than by us.
--
-- ─────────────────────────────────────────────────────────────────────
-- IT DOES NOT STORE THE CONVERSATION, AND THAT IS THE DESIGN
-- ─────────────────────────────────────────────────────────────────────
--
-- The plan said "record what was asked". This records WHICH QUESTION
-- the records failed to answer, not the visitor's words, and a narrower
-- thing than the plan asked for is worth stating rather than quietly
-- doing.
--
-- A visitor's own sentence routinely carries their name, their phone
-- number, their address, or their situation — "my mother is in hospital
-- in Gomti Nagar, can you deliver by six". Keeping that would put
-- personal data into a table the owner reads over a dashboard, for a
-- visitor who may never have consented to anything, to answer a
-- question that does not need it. `question_key` answers it completely:
-- "four customers asked which areas you serve and you have not said" is
-- the whole finding, and is actionable without one word of anybody's
-- message.
--
-- No visitor_id either. The gap belongs to the BUSINESS, not to the
-- person who found it, and nothing here needs to know who asked.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY NOT claim_checks
-- ─────────────────────────────────────────────────────────────────────
--
-- Checked rather than assumed: `claim_checks` is read by
-- lib/autonomy/overview.ts and lib/claims/outputMonitor.ts, which count
-- its rows to decide whether S7 should DEMOTE a business's autonomy.
-- Its rows mean "this is the copy that went out, and here is what the
-- guard took out of it". A chat gap is not copy, never went out, and
-- nothing was removed from it — writing one there would make a
-- customer's unanswered question look like a claims escape and could
-- take away a permission nobody misused.

create table if not exists answer_gaps (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- An interview question key (lib/onboarding/interview.ts), or
  -- 'other'. The agent picks from the questions the interview can
  -- actually answer, so a gap maps to something the owner can be asked
  -- — and anything it returns that is not one of them is stored as
  -- 'other' rather than trusted.
  --
  -- NO CHECK CONSTRAINT, reusing migration 170's reasoning as 217 did:
  -- the question registry is code and moves faster than migrations, and
  -- a mismatch should be caught by a test rather than by a failed
  -- insert at the worst possible moment. tests/answerGaps.test.ts is
  -- that test.
  question_key text not null,

  -- Which surface the customer was on. 'website_chat' today; kept
  -- because the same gap arriving from WhatsApp or a DM is a different
  -- strength of signal and the owner will want them apart.
  source text not null default 'website_chat',

  created_at timestamptz not null default now()
);

create index if not exists idx_answer_gaps_dealership
  on answer_gaps(dealership_id, created_at desc);

alter table answer_gaps enable row level security;

-- READ BY THE OWNER, WRITTEN BY NOBODY WITH A SESSION. The only writer
-- is the public chat route on the service client: a visitor is not
-- signed in, and nothing a browser sends should be able to create a
-- finding about a business. So there is a select policy and no insert
-- policy at all — the same shape migration 196 used, and the opposite
-- of the RAG-table mistake where anon held TRUNCATE.
create policy "answer_gaps_owner_select" on answer_gaps
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

-- VERIFY. Expected: 4 rows — id, dealership_id, question_key, source,
-- created_at (question_key and source NOT NULL).
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name = 'answer_gaps' order by ordinal_position;
--
-- AND: RLS on, exactly one policy, and it is a SELECT policy.
-- Expected: rowsecurity = true, then one row: answer_gaps_owner_select | SELECT.
--
-- select relrowsecurity from pg_class where relname = 'answer_gaps';
-- select policyname, cmd from pg_policies where tablename = 'answer_gaps';
--
-- AND: nothing is in it yet. Expected: 0.
--
-- select count(*) from answer_gaps;
