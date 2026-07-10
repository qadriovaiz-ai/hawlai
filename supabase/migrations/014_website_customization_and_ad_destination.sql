-- ============================================================
-- Website customization + ad destination routing
-- ============================================================

-- A dealer who already has their own website can use that instead of
-- Hawlai's built-in landing page. When set, this becomes the
-- destination ads can point to.
alter table dealerships add column if not exists external_website_url text;

-- Landing page theme (a preset color palette key, not free-form CSS —
-- keeps every page looking intentional without needing a real visual
-- editor) and an optional gallery of specific cars/offers to show.
alter table landing_pages add column if not exists theme text default 'navy_amber';
alter table landing_pages add column if not exists car_listings jsonb default '[]'::jsonb;
