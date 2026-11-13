-- ============================================================
-- Which page the visitor was actually on
-- ============================================================
-- V1 of docs/AUDIT-VISITOR-ENGINE.md, and the keystone of the whole
-- Organic Visitor Engine: nothing in V2 (visits), V3 (the intent score)
-- or V4b (the agent knowing where the visitor is standing) can exist
-- without it.
--
-- WHAT WAS WRONG, AND IT IS THE CHEAPEST FAULT IN THE AUDIT.
-- `/api/public/track` already RECEIVES enough to know the page — the
-- client sends a slug and the route resolves it — but the slug it
-- receives is the SITE's, not the page's. `PageTracker` mounts in
-- `/site/[slug]/layout.tsx`, so every page of a built site writes the
-- same value: the home page, the about page and a product page are
-- indistinguishable in this table.
--
-- So "pages viewed", "did they look at pricing twice" and "which page
-- did they come back to" — the signals the whole vision rests on — were
-- not merely unmeasured, they were UNRECORDABLE, while the information
-- arrived at the server and was dropped.
--
-- THE PATH, NEVER THE URL. This column takes `location.pathname` with
-- the query string and the fragment REMOVED, and that is the whole of
-- its privacy design:
--
--   /site/a-shop/products/123          stored
--   /site/a-shop/thanks?email=x@y.com  stored as /site/a-shop/thanks
--
-- A query string is where personal data gets into analytics: unsubscribe
-- tokens, emails in shared links, session ids. This table is read by
-- five other features and by the owner's dashboard, and none of them
-- needs a parameter. The stripping happens in the browser AND is
-- re-applied on the server, because a client that sends one anyway must
-- not be able to store it.
--
-- NULLABLE, and every row written before today has none. "We did not
-- record the page" is not "the visitor was on /" — the same distinction
-- `daysSinceChange` and `webhook_deliveries` already keep.
--
-- RUN BY HAND, as every migration here is.

alter table page_events
  add column if not exists path text;

comment on column page_events.path is
  'The page the visitor was on, as location.pathname with the query string and fragment removed and capped at 200 characters. NEVER a full URL: a query string is where personal data reaches analytics. NULL on every row written before 13 Nov 2026 and on any event whose page could not be determined — which is not the same as the visitor being on "/".';

-- Asking "how many people looked at this page" and "what did this
-- visitor look at" are the two queries V2 and V3 are built from.
create index if not exists idx_page_events_path on page_events(dealership_id, path);

-- ---- verify -----------------------------------------------------
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'page_events' and column_name = 'path';
--
-- Expected: one row — path / text / YES.
--
--   select count(*) as rows, count(path) as with_a_path
--   from page_events;
--
-- Expected right after running this: with_a_path is 0 and rows is
-- whatever you already had. That is not a bug — it is the gap becoming
-- visible. It fills in from the next visit onward.
--
--   select path, count(*)
--   from page_events
--   where is_internal = false and path is not null
--   group by path order by count(*) desc limit 20;
--
-- Run this a day after deploying: it is the first time this product can
-- answer "which pages do people actually look at".
--
--   select count(*) from page_events where path like '%?%' or path like '%#%';
--
-- Expected: 0, ALWAYS. A row here means the stripping failed on both
-- sides and a query string reached the table.
