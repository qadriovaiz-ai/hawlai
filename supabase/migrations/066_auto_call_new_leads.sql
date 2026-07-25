-- Automatic AI calling for new leads — opt-in, off by default, matching
-- the app's existing approval-first pattern for anything that acts
-- without a per-instance human click (DM auto-reply, email automation,
-- workflow engine all work the same way: an explicit toggle, not a
-- silent default-on).
alter table dealerships add column if not exists auto_call_new_leads boolean default false;
