-- 215: Decision and Outcome records — S5/P0.
--
-- C5's gap, in one sentence: nothing records WHY a piece of work was
-- done, so nothing can learn from it. `business_memory` (089) holds
-- free-text insights and keeps doing that; these two tables hold the
-- typed records that have an expected effect, a way to measure it, and
-- a date to look.
--
-- THE RULE THE WHOLE STAGE IS BUILT ON, and the reason these CHECKs are
-- as strict as they are:
--
--   An outcome records a MEASURED CHANGE and whether anything connects
--   that change to the action. It never records causation.
--
--   And "we could not tell" is a DIFFERENT outcome from "it had no
--   effect". Conflating those two is how a product learns the wrong
--   lesson and then acts on it confidently. `not_measurable` is
--   therefore a first-class verdict with a required reason, not an
--   absent row.
--
-- Every stage before this one made statements about what IS, checkable
-- by looking. This one makes statements about what HAPPENED, and the
-- obvious next step from there is a claim about what WORKED — which is
-- a claim about cause. src/lib/claims exists because claims nobody
-- measured are how this product has hurt people before.
--
-- VOCABULARIES ARE REUSED, NOT INVENTED. `confidence` is the same three
-- words business_signals has used since migration 198 — counted,
-- observed, inferred. A fourth vocabulary for the same idea is how two
-- parts of a product come to disagree about what they know.
--
-- DELTA IS GENERATED, NEVER WRITTEN. Migration 210 made the same choice
-- for `score` and said why: a stored number and its inputs are two
-- descriptions of one thing, and this project has paid five times for a
-- second description that drifted. Postgres computes it or there is no
-- delta.

-- ------------------------------------------------------------------
-- decisions
-- ------------------------------------------------------------------
create table if not exists decisions (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- What this decision was in service of, where that is known. Both
  -- nullable: an owner can decide something no goal covers.
  goal_id uuid references goals(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,

  -- A CLOSED SET, unlike action_levels.action_key (migration 209),
  -- and for the opposite reason. 209 left its key unconstrained
  -- because the policy table is code and moves faster than migrations.
  -- Here the results job must know HOW TO MEASURE each kind, so a kind
  -- it has never heard of is a decision nobody can ever score. Better
  -- refused at insert than written and silently unmeasurable.
  kind text not null check (kind in (
    'approval_granted',
    'goal_confirmed',
    'suggestion_acted_on',
    'automation_switched'
  )),

  -- The action, in the owner's terms. What he would recognise.
  what text not null,

  -- WHY, AS POINTERS RATHER THAN PROSE: a JSON array of {kind, id}, the
  -- same shape opportunities.evidence has carried since migration 210,
  -- so one renderer can show either. Prose here would be a second
  -- description of facts that already have rows.
  why jsonb not null default '[]'::jsonb,

  -- WHAT WAS EXPECTED, AND IT IS NULLABLE ON PURPOSE (the founder's
  -- call, 3 November 2026). "I am doing this because it is obviously
  -- right" is an honest decision, and forcing a forecast would make
  -- this product invent numbers — the one thing it must not do. The
  -- cost is accepted knowingly: a decision with no expected effect can
  -- never be scored against one.
  expected_effect jsonb,

  -- The counted metric the results job will read at the check date.
  -- Named, so the job does not have to guess what success meant.
  measure text not null,

  -- When to look.
  check_date date not null,

  -- The owner, or which part of the product.
  decided_by text not null,

  created_at timestamptz not null default now()
);

-- `why` is a list, so a renderer can count it. Same constraint
-- opportunities.evidence carries, for the same reason.
alter table decisions drop constraint if exists decisions_why_is_array;
alter table decisions
  add constraint decisions_why_is_array
  check (jsonb_typeof(why) = 'array');

-- An expected effect that cannot be read is not an expected effect.
-- Null is fine; half of one is not.
alter table decisions drop constraint if exists decisions_expected_effect_shape;
alter table decisions
  add constraint decisions_expected_effect_shape
  check (
    expected_effect is null
    or (expected_effect ? 'metric' and expected_effect ? 'direction')
  );

-- A CHECK DATE BEFORE THE DECISION IS NONSENSE: it would come due the
-- moment it was written, and be measured before the action could have
-- had any effect at all. That is not a measurement, it is noise with a
-- number on it.
alter table decisions drop constraint if exists decisions_check_date_not_before;
alter table decisions
  add constraint decisions_check_date_not_before
  check (check_date >= (created_at)::date);

comment on table decisions is
  'One row per thing the product or the owner decided to do, with why (as evidence pointers), what was expected, how it will be measured and when to look. C5. business_memory keeps holding free-text insights; this is the typed record.';
comment on column decisions.why is
  'JSON array of {kind, id} pointers, the same shape as opportunities.evidence. Pointers rather than prose: the facts already have rows.';
comment on column decisions.expected_effect is
  'NULLABLE BY DECISION (3 November 2026): a decision taken because it is obviously right is honest, and forcing a forecast would make this product invent numbers. Such a decision can never be scored against an expectation, which is the accepted cost.';
comment on column decisions.measure is
  'The counted metric the results job reads at check_date. Named so the job never has to guess what success meant.';
comment on column decisions.kind is
  'Closed set, unlike action_levels.action_key: the results job must know how to measure each kind, so an unknown kind would be a decision nobody can score.';

create index if not exists idx_decisions_due on decisions(check_date, dealership_id);
create index if not exists idx_decisions_dealership on decisions(dealership_id, created_at desc);

alter table decisions enable row level security;
drop policy if exists "decisions_dealership_all" on decisions;
create policy "decisions_dealership_all" on decisions
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

-- ------------------------------------------------------------------
-- outcomes
-- ------------------------------------------------------------------
create table if not exists outcomes (
  id uuid primary key default uuid_generate_v4(),

  -- ONE OUTCOME PER DECISION. A second row would make "which one is
  -- right" a question nobody should have to answer, and the results
  -- job genuinely re-enters a run whose invocation ran out of time.
  decision_id uuid references decisions(id) on delete cascade not null unique,

  measured_at timestamptz not null default now(),

  -- The numbers, from counted data. Null together when nothing could
  -- be measured.
  measured_before numeric,
  measured_after numeric,

  -- GENERATED, NEVER WRITTEN. See the header: a stored number and its
  -- inputs are two descriptions of one thing.
  delta numeric generated always as (measured_after - measured_before) stored,

  -- THE SAME THREE WORDS business_signals HAS USED SINCE MIGRATION 198.
  confidence text not null check (confidence in ('counted', 'observed', 'inferred')),

  -- Whether anything connects the change to the action, from migration
  -- 196's attribution. 'none' is a real and common answer.
  attribution text not null check (attribution in ('direct', 'partial', 'none')),

  -- AND THE FOURTH VALUE IS THE POINT OF THE WHOLE STAGE. "We could not
  -- tell" is not "it had no effect".
  verdict text not null check (verdict in ('improved', 'unchanged', 'worsened', 'not_measurable')),

  -- Stated when the verdict is not_measurable, never left to be
  -- inferred from an absence.
  why_not_measurable text,

  created_at timestamptz not null default now()
);

-- A VERDICT ABOUT A CHANGE NEEDS THE CHANGE. Anything but
-- not_measurable requires both numbers, so "improved" can never mean
-- "felt better".
alter table outcomes drop constraint if exists outcomes_verdict_needs_numbers;
alter table outcomes
  add constraint outcomes_verdict_needs_numbers
  check (
    verdict = 'not_measurable'
    or (measured_before is not null and measured_after is not null)
  );

-- AND not_measurable NEEDS ITS REASON. An unexplained "could not tell"
-- is the silence this stage exists to stop; three guards in the two
-- days before this migration failed by saying nothing.
alter table outcomes drop constraint if exists outcomes_not_measurable_needs_reason;
alter table outcomes
  add constraint outcomes_not_measurable_needs_reason
  check (
    verdict <> 'not_measurable'
    or (why_not_measurable is not null and length(btrim(why_not_measurable)) > 0)
  );

-- "COUNTED" MUST MEAN COUNTED. The weaker two words exist for the
-- cases this one does not cover.
alter table outcomes drop constraint if exists outcomes_counted_needs_numbers;
alter table outcomes
  add constraint outcomes_counted_needs_numbers
  check (
    confidence <> 'counted'
    or (measured_before is not null and measured_after is not null)
  );

comment on table outcomes is
  'One row per decision, written at its check date. Records a MEASURED CHANGE and whether anything connects it to the action — never causation. C5.';
comment on column outcomes.delta is
  'GENERATED, never written: measured_after - measured_before. Null until both are set.';
comment on column outcomes.confidence is
  'counted | observed | inferred — the same vocabulary business_signals has used since migration 198. A fourth set of words for one idea is how two parts of a product come to disagree about what they know.';
comment on column outcomes.attribution is
  'direct | partial | none, from migration 196. Separate from the verdict on purpose: a change can be real AND unattributable, and the honest row says both.';
comment on column outcomes.verdict is
  'improved | unchanged | worsened | not_measurable. The fourth is the point: "we could not tell" is not "it had no effect", and conflating them is how a product learns the wrong lesson.';
comment on column outcomes.why_not_measurable is
  'Required when the verdict is not_measurable. An unexplained "could not tell" is the silence this stage exists to stop.';

create index if not exists idx_outcomes_decision on outcomes(decision_id);

alter table outcomes enable row level security;
drop policy if exists "outcomes_dealership_all" on outcomes;
create policy "outcomes_dealership_all" on outcomes
  for all using (
    decision_id in (
      select d.id from decisions d
      join dealerships ds on ds.id = d.dealership_id
      where ds.owner_id = auth.uid()
    )
  );
