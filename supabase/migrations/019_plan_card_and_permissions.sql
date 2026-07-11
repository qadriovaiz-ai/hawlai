-- ============================================================
-- Plan Card preview flow + Permission Tiers
-- ============================================================

-- Lets the ad-launch flow split into two phases: preview (plan +
-- creative generated, nothing sent to Meta yet) and launch (an
-- already-previewed draft gets published). Storing the full plan as
-- JSON means the launch step can reuse it exactly as shown in the
-- preview, instead of risking Claude generating something slightly
-- different the second time.
alter table ad_creatives add column if not exists plan_json jsonb;

-- Permission Tiers (Block 7): which categories of action, if any,
-- Ovaiz allows to run without a manual approval each time. Defaults
-- to everything OFF — matching the explicit 'always ask me first'
-- choice made earlier in this project. This is opt-in, not a silent
-- behavior change.
alter table dealerships add column if not exists auto_pause_low_performers boolean default false;
alter table dealerships add column if not exists auto_budget_reallocate_percent integer default 0;
