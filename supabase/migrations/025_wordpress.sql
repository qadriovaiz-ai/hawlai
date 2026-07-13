-- ============================================================
-- WordPress — Application Passwords, built into WordPress core
-- since 5.6, no approval process needed
-- ============================================================
alter table dealerships add column if not exists wordpress_site_url text;
alter table dealerships add column if not exists wordpress_username text;
alter table dealerships add column if not exists wordpress_app_password text;
