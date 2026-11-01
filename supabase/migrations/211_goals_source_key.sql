-- 211: where a goal came from — S4/P6.
--
-- THE MISSING LINK, stated plainly. The Growth Manager drafts setup
-- steps from its own audit (strategy.ts setupGoalsFrom); the owner has
-- a Tasks page that confirms draft goals (GoalsSection.tsx ->
-- /api/goals/[id]/confirm); and a finding may not be surfaced without
-- a goal it serves (migration 210's goal_id). Every piece existed
-- except the one that writes a drafted step into `goals` — so since 24
-- October the daily report has carried the sentence "Approve a plan and
-- they will appear here", naming a mechanism that did not exist.
--
-- WHY A KEY AND NOT THE TITLE. linkFindingsToGoals matched a goal to a
-- finding by EXACT TITLE, because `goals` had no stable identifier. I
-- wrote that weakness into its own comment at the time: "a renamed goal
-- silently unlinks its findings". Renaming your own goal is a normal
-- thing to do, and today it would quietly stop the suggestions the goal
-- was approved for. source_key holds the finding type the step came
-- from (`pages_without_search_title`), so the link survives any rename.
--
-- THE INDEX HAS NO STATUS PREDICATE, and that is the whole of "it
-- appears once". /api/goals/[id]/discard sets status = 'abandoned'
-- rather than deleting the row, so an index covering only
-- ('draft','active') would let a step the owner explicitly discarded be
-- re-drafted the next morning, and the morning after that. One setup
-- step produces at most ONE goal row per business, ever. Discard
-- therefore means no.
--
-- Re-opening a step after its goal is completed is deliberately not
-- possible here. That is an outcome decision, it belongs with the
-- outcome records S5 adds, and guessing at it from the finding's
-- absence would repeat the mistake syncOpportunities was making until
-- migration 210: one producer resolving another's rows.
--
-- NOTHING EXISTING IS TOUCHED. One nullable column and one partial
-- index; every goal written by set_goal, growth_advisor or by hand
-- keeps source_key null and is unaffected by the index.

alter table goals add column if not exists source_key text;

-- One goal per setup step per business, in any status.
create unique index if not exists idx_goals_source_key_unique
  on goals(dealership_id, source_key)
  where source_key is not null;

comment on column goals.source_key is
  'The audit finding type this goal was drafted from (src/lib/growth/strategy.ts GOAL_FOR), or null for a goal that came from anywhere else. Rename-proof join for src/lib/growth/strategist.ts linkFindingsToGoals, which falls back to an exact title match when it is null. Unique per business in ANY status, so a discarded setup step is not re-offered tomorrow.';
