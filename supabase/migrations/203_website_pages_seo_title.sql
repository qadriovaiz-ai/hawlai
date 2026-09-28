-- The search-engine title, kept apart from the navigation label.
--
-- website_pages.title is two things at once today. The site's nav reads
-- it (app/site/[slug]/layout.tsx), so for every homepage ever generated
-- it holds the literal string "Home" — while Website Builder labels the
-- same input "Page title (browser tab & search results)". One column
-- cannot be both a menu item and a title tag: an owner who sets a proper
-- SEO title would find their nav link reading "Handmade Soy Candles in
-- Shahjahanpur | Candle by Qaaf".
--
-- So the title tag gets its own column. Nullable, and null keeps exactly
-- the behaviour a site has now:
--   home  -> seo_title, else title if it isn't the default "Home" label,
--            else the business's display name
--   other -> seo_title, else "<title> | <business>"
--
-- Additive only. No existing row changes, no default backfill — a
-- backfill would write a guessed title onto live pages nobody reviewed.

alter table website_pages
  add column if not exists seo_title text;

comment on column website_pages.seo_title is
  'The <title> tag for this page. Null falls back to the nav title and then the business display name. Written by Website Builder and, with approval, by chat (publish action update_page_meta).';
