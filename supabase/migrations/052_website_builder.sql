-- Website Builder — a genuine multi-page site per dealership, distinct
-- from the existing single landing_pages row (kept as-is for the
-- quick-launch ad-landing-page use case) and seo_pages (standalone SEO
-- content pages). A website has an ordered set of pages (Home, About,
-- Services, Team, Contact, etc — chosen per business type), each built
-- from an ordered array of content "sections" (hero, text, features,
-- gallery, testimonials, team, pricing, faq, cta, contact form) so any
-- business type can be assembled from the same building blocks instead
-- of needing a hardcoded template per industry.

create table if not exists websites (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null unique,

  slug text unique not null,
  site_type text default 'service_business', -- 'service_business' | 'real_estate' | 'restaurant' | 'ecommerce' | 'professional' | 'portfolio'
  theme_key text default 'navy_amber',
  nav_order jsonb not null default '[]'::jsonb, -- ordered array of page slugs for the nav menu

  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists website_pages (
  id uuid primary key default uuid_generate_v4(),
  website_id uuid references websites(id) on delete cascade not null,

  slug text not null, -- 'home' | 'about' | 'services' | 'contact' | custom
  title text not null,
  page_type text default 'custom', -- 'home' | 'about' | 'services' | 'products' | 'team' | 'contact' | 'faq' | 'custom'
  meta_description text,
  sections jsonb not null default '[]'::jsonb, -- ordered array of {type, ...fields}
  order_index integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(website_id, slug)
);

create index if not exists idx_websites_dealership_id on websites(dealership_id);
create index if not exists idx_website_pages_website_id on website_pages(website_id);

alter table websites enable row level security;
alter table website_pages enable row level security;

drop policy if exists "websites_dealership_all" on websites;
create policy "websites_dealership_all" on websites
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop policy if exists "website_pages_dealership_all" on website_pages;
create policy "website_pages_dealership_all" on website_pages
  for all using (website_id in (select id from websites where dealership_id in (select id from dealerships where owner_id = auth.uid())));

create or replace function public.set_websites_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_websites_update on websites;
create trigger on_websites_update
  before update on websites
  for each row execute procedure public.set_websites_updated_at();

drop trigger if exists on_website_pages_update on website_pages;
create trigger on_website_pages_update
  before update on website_pages
  for each row execute procedure public.set_websites_updated_at();
