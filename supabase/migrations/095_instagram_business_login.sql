-- Migration 095: Instagram Business Login support — a genuinely
-- separate auth path from the existing Facebook Page connection.
-- Instagram Business Login issues its own Instagram-scoped account ID
-- and access token, used against graph.instagram.com (not
-- graph.facebook.com) — these need their own storage, not reused
-- fb_page_id/fb_page_access_token fields.

alter table dealerships add column if not exists instagram_business_id text;
alter table dealerships add column if not exists instagram_access_token text;

create index if not exists idx_dealerships_instagram_business_id on dealerships(instagram_business_id);
