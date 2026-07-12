-- ============================================================
-- Guided onboarding — chat-first, like Cursor/Lovable/Emergent
-- ============================================================
-- Tracks whether a dealership has been through the post-signup
-- onboarding chat, so it only shows once (or until explicitly
-- skipped) rather than on every login.

alter table dealerships add column if not exists onboarding_completed boolean default false;
