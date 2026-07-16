-- SEO Toolkit — the 8 SEO tasks not already covered by the existing
-- keyword research / blog generation / technical audit / CRO tools
-- on the SEO page: competitor keywords, internal linking, meta tags,
-- schema markup, site speed suggestions, backlink strategy, local
-- SEO, Google Business Profile optimization.

create table if not exists seo_toolkit_items (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- e.g. 'meta_tags', 'schema', 'local_seo'
  topic text,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_seo_toolkit_items_dealership_id on seo_toolkit_items(dealership_id);

alter table seo_toolkit_items enable row level security;

create policy "seo_toolkit_items_dealership_all" on seo_toolkit_items
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
