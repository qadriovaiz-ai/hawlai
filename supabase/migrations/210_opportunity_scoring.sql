-- 210: what the Strategist needs on a finding — S4/P0.
--
-- `opportunities` (migration 010) records that something is wrong. It
-- cannot record how much it matters, what it is based on, which goal it
-- serves, or that the owner already said no — so none of the founder's
-- four Strategist rules can be computed from it:
--
--   score      impact x confidence / effort   -> no columns
--   cap        3 actions a day                -> nothing says a finding
--                                               was shown today
--   cooldown   30 days after a rejection      -> `status` has no
--                                               'rejected' value and
--                                               `resolved_at` is the
--                                               only timestamp
--   evidence   "each suggestion cites evidence and the goal it serves"
--                                            -> neither is stored
--
-- THE SCORE IS A GENERATED COLUMN, not a number the application writes.
-- A stored score and its inputs are two descriptions of one thing, and
-- this project has paid four times for a second description that
-- drifted — the grading sheet, the output gate, the records box and the
-- cost estimator. Postgres computes it from the inputs or there is no
-- score.
--
-- THE INPUTS ARE ALL-OR-NOTHING AND NEVER ZERO. One CHECK keeps all
-- three between 1 and 5 or all three null, so a half-scored row cannot
-- exist and the division in the generated column can never be by zero.
--
-- THE UNIQUE INDEX NOW COVERS 'rejected' TOO, and this is the part that
-- makes the cooldown real rather than advisory. opportunityAgent's
-- syncOpportunities inserts any candidate it cannot see as 'open'; with
-- 'rejected' outside the index a finding the owner refused yesterday
-- would be inserted fresh tomorrow and surface again, cooldown and all.
-- The same commit teaches syncOpportunities to leave a rejected row
-- alone, because the index alone would turn that into a failed insert
-- rather than a correct skip.

alter table opportunities
  add column if not exists impact smallint,
  add column if not exists confidence smallint,
  add column if not exists effort smallint,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists goal_id uuid references goals(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists last_surfaced_on date;

-- All three, in range, or none of them.
alter table opportunities drop constraint if exists opportunities_score_inputs_check;
alter table opportunities
  add constraint opportunities_score_inputs_check
  check (
    (impact is null and confidence is null and effort is null)
    or (
      impact between 1 and 5
      and confidence between 1 and 5
      and effort between 1 and 5
    )
  );

-- Derived, never written.
alter table opportunities
  add column if not exists score numeric
  generated always as (
    case
      when impact is null or confidence is null or effort is null then null
      else round((impact::numeric * confidence::numeric) / effort::numeric, 3)
    end
  ) stored;

-- 'rejected' is the owner saying no, which is not the same as
-- 'dismissed' (cleared from the list) or 'completed' (the issue is
-- gone). Only a rejection starts a cooldown.
alter table opportunities drop constraint if exists opportunities_status_check;
alter table opportunities
  add constraint opportunities_status_check
  check (status in ('open', 'completed', 'dismissed', 'rejected'));

-- A rejection without its date is a cooldown nobody can compute.
alter table opportunities drop constraint if exists opportunities_rejected_at_check;
alter table opportunities
  add constraint opportunities_rejected_at_check
  check (status <> 'rejected' or rejected_at is not null);

-- Evidence is a list, so the renderer can count it.
alter table opportunities drop constraint if exists opportunities_evidence_is_array;
alter table opportunities
  add constraint opportunities_evidence_is_array
  check (jsonb_typeof(evidence) = 'array');

-- One live row per finding, where live now includes a rejection in its
-- cooldown. Replaces idx_opportunities_open_unique from 010.
drop index if exists idx_opportunities_open_unique;
create unique index if not exists idx_opportunities_live_unique
  on opportunities(dealership_id, type, reference_id)
  where status in ('open', 'rejected');

-- The cap's query: how many were shown today.
create index if not exists idx_opportunities_surfaced
  on opportunities(dealership_id, last_surfaced_on)
  where last_surfaced_on is not null;

comment on column opportunities.impact is
  'Strategist input, 1-5. All three of impact/confidence/effort are set together or left null; see opportunities_score_inputs_check.';
comment on column opportunities.effort is
  'Strategist input, 1-5. Never 0: it is the divisor in the generated score.';
comment on column opportunities.score is
  'GENERATED, never written: round(impact * confidence / effort, 3). Null until all three inputs are set.';
comment on column opportunities.evidence is
  'JSON array of {kind, id} pointers the owner can go and look at. A suggestion with an empty array is not rendered — see src/lib/growth/findings.ts surfaceable().';
comment on column opportunities.goal_id is
  'The 90-day goal this finding serves. Required before a finding may be surfaced: the exit test is "each suggestion cites evidence and the goal it serves".';
comment on column opportunities.rejected_at is
  'When the owner said no. Starts the 30-day cooldown in findings.ts inCooldown().';
comment on column opportunities.last_surfaced_on is
  'The last day this finding appeared in a report, for the 3-a-day cap.';
