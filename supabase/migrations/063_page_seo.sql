-- Per-page SEO — Open Graph image URL alongside the title/meta_description
-- columns that already existed on website_pages but were never exposed
-- in the Site Editor UI or actually used by the public site/[slug] pages
-- (those routes had no generateMetadata at all until now — every page
-- silently inherited the root layout's generic "Hawlai" title).

alter table website_pages add column if not exists og_image_url text;
