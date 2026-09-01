-- Persist the raw business description the owner types during
-- onboarding (WelcomeChatCard's "describe" step) and in Settings ->
-- Brand's analyzer.
--
-- Until now that text was sent to the AI, used to derive a Brand Voice
-- Profile, and then thrown away. The derived profile survived; the
-- SOURCE did not. That meant the analyzer textarea opened blank every
-- time, so "edit what you told us and re-derive" was impossible — the
-- only way to change the voice was to retype the whole description
-- from memory, or hand-edit the derived fields one by one.
--
-- ALTER TABLE, not CREATE TABLE, so no RLS block belongs here:
-- 005_brand_profiles.sql already enables row level security on this
-- table with a dealership-scoped policy, and a new column is covered
-- by it automatically. Adding a second policy would be redundant and
-- would obscure which one actually governs the table.

alter table brand_profiles
  add column if not exists business_description text;

comment on column brand_profiles.business_description is
  'Raw free-text description the owner typed during onboarding. Kept as the source input so the brand voice can be re-derived or the text edited later.';
