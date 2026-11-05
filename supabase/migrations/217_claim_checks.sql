-- 217: a row per customer-facing output that actually went out — S7/P1.
--
-- WHY THIS EXISTS, measured on 5 November 2026 before a line was
-- written. S7's demotion rule has to fire when an unsupported claim
-- reaches the public. Nothing in this product recorded what reached the
-- public, and nothing recorded what the claim check said about it:
--
--   * generateCopy returns `removed`, `substantiation`, `publishable`
--     and `droppedSentences`, and every one of those is thrown away
--     when the request ends.
--   * src/lib/claims is nine files. A grep for writes across all of
--     them finds reads only.
--   * email_sends (migration 088) stores the subject and not the body.
--
-- So the question "how often did a sentence we could not support reach
-- a customer this month?" had no answer at all. Not approximately —
-- none. This table is the answer, and S7/P2's monitor is what reads it.
--
-- WRITTEN AT THE MOMENT THE THING GOES OUT, not when it is drafted.
-- Migration 216 learned this the hard way about baselines: an action
-- and the record of it happen in the same instant, and anything
-- reconstructed afterwards is a guess. One row per output that
-- executed, written by the executor, which is the one place that knows
-- the change actually landed.
--
-- THE TEXT IS STORED, AND A HASH WOULD NOT DO. The monitor's whole job
-- is to read the surviving sentences back and ask the extractor about
-- them again from scratch — "THE RUN CANNOT BE THE JUDGE OF THE RUN",
-- scripts/eval/outputGate.eval.ts. A hash cannot be re-read. S7/P2
-- clears `text` once a verdict exists and keeps only the sentences that
-- were refused, so the copy is held no longer than the check needs it.
--
-- WHAT IS NOT IN HERE, and the founder should know it is a question
-- rather than an oversight: for the page surfaces this holds the
-- business's own marketing copy and nothing about any person. When
-- S7/P1b widens it to emails and WhatsApp replies, the text WILL
-- contain a customer's name, and the retention rule above becomes a
-- DPDP question rather than a tidiness one. Raised with him on
-- 5 November 2026; not decided here.

create table if not exists claim_checks (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Which kind of output this was, in the product's own words:
  -- page_meta, page_text, email, whatsapp, social, lead_message,
  -- product_description.
  --
  -- NO CHECK CONSTRAINT, and migration 170's reasoning is reused
  -- rather than re-argued: "the policy table is code and moves faster
  -- than migrations, and a mismatch is caught by a test rather than by
  -- a failed insert at the worst possible moment."
  -- tests/claimChecks.test.ts is that test, and it refuses to record a
  -- surface the code does not know rather than inventing one.
  surface text not null,

  -- The publish action this came from, where there was one. Null for a
  -- one-shot send, which has no action row of its own.
  --
  -- UNIQUE WHERE PRESENT. A publish action is single-use, so a second
  -- row for the same action would be a retry recorded as a second
  -- thing that went out — which would make the monitor count one
  -- escape twice and could demote on a duplicate.
  action_id uuid references publish_actions(id) on delete set null,

  -- The copy as it went out. See the header on why this is the text
  -- and not a hash, and on what P2 does with it afterwards.
  text text not null,

  -- WHAT THE PIPELINE ITSELF SAID, which is one of two judges and the
  -- weaker one. These are the generator's own account of its own work.
  --
  -- claims_removed: sentences or phrases the guard took out BEFORE this
  -- could go out. A high number here is the system WORKING.
  claims_removed integer not null default 0,
  -- claims_unsupported: unsupported claims that were deliberately KEPT
  -- and did go out. Expected to be zero except in the case below.
  claims_unsupported integer not null default 0,

  -- WERE THOSE KEPT ONES THE OWNER'S OWN WORDING?
  --
  -- THE DISTINCTION THAT STOPS THE DEMOTION RULE BEING WRONG. The page
  -- tools already have this branch: when the owner wrote the line
  -- himself, an unsupported claim is KEPT and he is told plainly that
  -- he is the one standing behind it. That is an unsupported claim
  -- reaching the public, and it is not this product's failure — it is
  -- the owner's sentence, which he is entitled to publish.
  --
  -- Without this column S7's demotion would fire on the owner's own
  -- words and take away a permission he never misused.
  owner_words boolean not null default false,

  -- Did it actually go out?
  --
  -- THE LOAD-BEARING COLUMN. Caught-and-removed is the system working;
  -- published is the system failing. A table that could not tell those
  -- apart would make the demotion rule fire on its own successes.
  published boolean not null default false,
  published_at timestamptz,

  -- ---- Filled by S7/P2's monitor, not by the writer ----------------
  --
  -- NULL MEANS NOBODY HAS LOOKED YET, and it must never be read as
  -- "clean". 'could_not_check' is a real and separate answer: an
  -- unreachable extractor is not a clean bill of health, and a monitor
  -- that quietly died must not look like a month with nothing wrong.
  monitor_verdict text check (monitor_verdict in ('clean', 'unsupported', 'could_not_check')),
  monitor_unsupported integer,
  -- The sentences the monitor refused, kept after `text` is cleared.
  monitor_findings jsonb not null default '[]'::jsonb,
  checked_at timestamptz,

  created_at timestamptz not null default now()
);

-- `monitor_findings` is a list, so a reader can count it. Same
-- constraint decisions.why and opportunities.evidence carry.
alter table claim_checks drop constraint if exists claim_checks_findings_is_array;
alter table claim_checks
  add constraint claim_checks_findings_is_array
  check (jsonb_typeof(monitor_findings) = 'array');

-- A verdict with no time on it cannot be aged out, and the monitor's
-- "how long since anything was checked" question is what suspends
-- promotion. So the two travel together or not at all.
alter table claim_checks drop constraint if exists claim_checks_verdict_has_a_time;
alter table claim_checks
  add constraint claim_checks_verdict_has_a_time
  check ((monitor_verdict is null) = (checked_at is null));

-- One row per publish action. See the column comment.
create unique index if not exists idx_claim_checks_action
  on claim_checks(action_id) where action_id is not null;

-- The monitor's own query: this business, published, not yet checked.
create index if not exists idx_claim_checks_unchecked
  on claim_checks(dealership_id, created_at desc) where published and monitor_verdict is null;

create index if not exists idx_claim_checks_dealership
  on claim_checks(dealership_id, created_at desc);

comment on table claim_checks is
  'One row per customer-facing output that actually went out, with what the claim check said about it (S7/P1). Written by the executor at the moment the change lands; read by S7/P2''s monitor, which is the second and independent judge. Before this table, the question "how often did an unsupported sentence reach a customer" had no answer at all.';

comment on column claim_checks.published is
  'Did this actually reach the public. Caught-and-removed is the system working; published is the system failing, and the demotion rule reads only this side.';

comment on column claim_checks.owner_words is
  'True when the unsupported claims that were kept are the owner''s own wording, which the page tools keep deliberately while telling him he is standing behind them. Not this product''s failure, and demotion must not fire on it.';

comment on column claim_checks.monitor_verdict is
  'NULL = nobody has looked yet, which is never to be read as clean. ''could_not_check'' is a real answer: an unreachable extractor is not a clean bill of health.';

alter table claim_checks enable row level security;

-- The owner may read his own copy and what was said about it. Every
-- INSERT and UPDATE happens through the service-role client from
-- trusted server code — same trust model as audit_log (128) and
-- daily_jobs (185) — so there is no client write policy at all.
drop policy if exists "claim_checks_owner_select" on claim_checks;
create policy "claim_checks_owner_select" on claim_checks
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
