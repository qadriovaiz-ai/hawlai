-- Site Editor essentials: a logo the owner can set independent of
-- regenerating content, shown in the storefront nav.
alter table websites add column if not exists logo_url text;
