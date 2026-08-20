-- Sandbox/Simulation Mode, scoped to set_goal — P2 28a
-- set_goal previously committed its decomposed plan immediately, with
-- no preview-before-save step, unlike everything else in this
-- codebase (ad drafts, approvals). Now it drafts a goal + its
-- proposed_tasks; a separate explicit confirm actually creates the
-- real tasks/agent_tasks rows and activates the goal.

alter table goals drop constraint goals_status_check;
alter table goals add constraint goals_status_check check (status in ('draft','active','completed','abandoned'));
alter table goals add column if not exists proposed_tasks jsonb;
