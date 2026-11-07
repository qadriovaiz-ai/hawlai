-- ============================================================
-- A page can be written before it is public
-- ============================================================
-- G3a of docs/AUDIT-GROWTH-LOOP.md, and it fixes a hazard that is
-- already live rather than only unblocking G3.
--
-- WHAT IS WRONG TODAY. `website_pages` has no published flag of its own.
-- A site is published or not (`websites.published`), and every page on a
-- published site is reachable the moment its row exists — so the Add
-- Page button in Website Builder puts an EMPTY page on the live site, at
-- a real URL, before the owner has written a word of it. The route that
-- renders it checks the site and then finds the page by slug; there is
-- nothing else to check.
--
-- AND ON 6 NOVEMBER I MADE IT WORSE. A1 added /sitemap.xml, which lists
-- every page of every published site. Before that an empty page could at
-- least only be found by somebody following a link, and there was no
-- link. Now it is advertised to crawlers the moment it is created. That
-- is my own change, and this is the column it needed.
--
-- WHY G3 CANNOT BE BUILT WITHOUT THIS. G3 proposes a page from a real
-- search gap and creates it on approval. Without a draft state, approving
-- that proposal would publish an empty page and put it in the sitemap —
-- the product doing, on its own initiative, the exact thing this
-- migration exists to stop.
--
-- DEFAULT true, AND THAT IS THE IMPORTANT HALF. Every page that exists
-- today is live today, and a column defaulting to false would unpublish
-- a whole platform's worth of pages the moment it was added. The new
-- state is opt-in: only a page created from now on, by a path that asks
-- for it, starts unpublished.
--
-- RUN BY HAND, as every migration here is.

alter table website_pages
  add column if not exists published boolean not null default true;

comment on column website_pages.published is
  'Whether this page is reachable on the live site and listed in /sitemap.xml. DEFAULT true, because every page that existed when this column was added was already live and a default of false would have unpublished all of them. A page created by Website Builder or proposed by the growth loop starts false, so an empty page is never public: see G3a in docs/AUDIT-GROWTH-LOOP.md.';

-- ---- verify -----------------------------------------------------
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'website_pages' and column_name = 'published';
--
-- Expected: one row — boolean / NO / true.
--
--   select count(*) as pages, count(*) filter (where published) as live
--   from website_pages;
--
-- Expected: the two numbers are EQUAL. Nothing that was live before this
-- migration has been taken down by it. If they differ, stop: something
-- has written false to a page that was already public.
