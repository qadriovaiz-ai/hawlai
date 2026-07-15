-- Content Marketing department — stores every piece generated across
-- all 20 content types (posts, carousels, blogs, scripts, hooks, CTAs,
-- calendar entries...) so the Content Marketing page has a real history
-- instead of throwaway AI output.

create table if not exists content_pieces (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  content_type text not null, -- e.g. 'instagram_post', 'blog_seo', 'video_script_youtube'
  topic text,
  output jsonb not null default '{}'::jsonb, -- shape varies by type, see contentMarketingAgent.ts
  scheduled_date date, -- optional, used when added to the content calendar
  status text default 'draft', -- draft | scheduled | published
  created_at timestamptz default now()
);

create index if not exists idx_content_pieces_dealership_id on content_pieces(dealership_id);
create index if not exists idx_content_pieces_scheduled_date on content_pieces(scheduled_date);

alter table content_pieces enable row level security;

create policy "content_pieces_dealership_all" on content_pieces
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
