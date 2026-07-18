-- Website Marketing. Landing Pages, Chatbot (AI Sales Agent), Forms,
-- and Analytics Setup already exist and aren't duplicated. This adds:
-- - Popups: exit-intent or timed popup on the existing landing page.
-- - Tracking Codes: dealer's own Google Analytics / Meta Pixel / GTM
--   IDs, injected into the landing page.
-- - SEO Pages: a genuinely new capability — multiple lightweight,
--   topic/service-specific SEO content pages beyond the one hero
--   landing page (which has a one-per-dealership unique constraint).

alter table landing_pages add column if not exists popup_enabled boolean default false;
alter table landing_pages add column if not exists popup_trigger text default 'exit_intent'; -- 'exit_intent' | 'timed'
alter table landing_pages add column if not exists popup_delay_seconds integer default 15;
alter table landing_pages add column if not exists popup_headline text;
alter table landing_pages add column if not exists popup_body text;
alter table landing_pages add column if not exists popup_cta_text text default 'Get in touch';

alter table landing_pages add column if not exists ga_tracking_id text;
alter table landing_pages add column if not exists meta_pixel_id text;
alter table landing_pages add column if not exists gtm_id text;

create table if not exists seo_pages (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  slug text unique not null,
  title text not null,
  meta_description text,
  h1 text not null,
  sections jsonb not null default '[]'::jsonb, -- [{heading, body}]
  published boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_seo_pages_dealership_id on seo_pages(dealership_id);

alter table seo_pages enable row level security;

create policy "seo_pages_dealership_all" on seo_pages
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
