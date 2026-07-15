-- Graphic Design department — every image generated across all 13
-- design types gets saved here (image lives in Supabase Storage,
-- this table just indexes it) so the page has a real gallery instead
-- of throwaway generations that vanish on refresh.

create table if not exists graphic_designs (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  design_type text not null, -- e.g. 'ad_creative', 'story', 'pitch_deck'
  prompt text,
  image_url text not null,
  created_at timestamptz default now()
);

create index if not exists idx_graphic_designs_dealership_id on graphic_designs(dealership_id);

alter table graphic_designs enable row level security;

create policy "graphic_designs_dealership_all" on graphic_designs
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
