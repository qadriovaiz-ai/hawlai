-- Migration 097: Fallback-content protection for the multi-page website
-- builder — URGENT fix. Root cause: /api/website-builder/generate (the
-- Regenerate button) and masterBrainV2.ts's build_website tool both
-- unconditionally delete every existing website_pages row and re-insert
-- whatever generateWebsite() returned, with zero check for (a) whether
-- individual pages fell back to placeholder text because the Anthropic
-- call failed, or (b) whether the site was already published/live. A
-- transient API failure during a regeneration on an already-live site
-- silently replaced real, live page content with
-- "Content coming soon — regenerate once the API is available." —
-- exactly the case found live on candle_by_qaaf.

-- 1. Track fallback state per page — lets the app (and this recovery
--    query) tell real content apart from placeholder content reliably,
--    instead of ever needing to text-match the fallback copy itself.
alter table website_pages add column if not exists is_fallback boolean not null default false;

comment on column website_pages.is_fallback is 'True when this page''s current sections are placeholder fallback content (the Anthropic call failed during generation), not real AI-written content. Never true for a page on a published website — the publish endpoint and the save-merge logic in websiteBuilderAgent.ts both enforce this.';

-- 2. One-time audit: which businesses currently have fallback content
--    live right now. Run this manually in the Supabase SQL editor to
--    see the damage before/while running the code-level regeneration
--    fix — this is a SELECT, not a fix, safe to run anytime.
--
-- select d.dealership_name, w.slug, w.published, wp.slug as page_slug, wp.title, wp.updated_at
-- from website_pages wp
-- join websites w on w.id = wp.website_id
-- join dealerships d on d.id = w.dealership_id
-- where wp.sections::text like '%Content coming soon — regenerate once the API is available.%'
-- order by w.published desc, d.dealership_name;

-- 3. Backfill is_fallback = true for any existing rows that already
--    contain the fallback copy right now, so the app immediately knows
--    about pre-existing damage without needing a regeneration pass
--    first (the recovery admin endpoint uses this flag to find what to
--    regenerate).
update website_pages
set is_fallback = true
where sections::text like '%Content coming soon — regenerate once the API is available.%'
  and is_fallback = false;
