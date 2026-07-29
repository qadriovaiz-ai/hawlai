-- Advanced canvas editor for Graphic Design — a real, editable design
-- document (text/image/shape elements with position/size/rotation/
-- style, ordered by z-index for layering), distinct from the existing
-- graphic_designs table (which stores one-shot AI-generated final
-- images with no post-generation editing). This is the actual data
-- model an editor like this needs: an array of elements the canvas
-- renders and the person can select/move/resize/restyle, not just a
-- finished PNG.
create table if not exists canvas_designs (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  name text not null default 'Untitled design',
  canvas_width integer not null default 1080,
  canvas_height integer not null default 1080,
  background_color text default '#ffffff',
  background_image_url text,

  -- The actual design content: an ordered array of elements. Kept as
  -- a single jsonb blob (not normalized into rows) because the canvas
  -- is always read/written as one whole document per edit, same
  -- reasoning as website_pages.sections storing its block tree as
  -- jsonb rather than one row per block.
  elements jsonb not null default '[]'::jsonb,

  thumbnail_url text,
  exported_image_url text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_canvas_designs_dealership_id on canvas_designs(dealership_id);

alter table canvas_designs enable row level security;
drop policy if exists "canvas_designs_dealership_all" on canvas_designs;
create policy "canvas_designs_dealership_all" on canvas_designs
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop trigger if exists on_canvas_designs_update on canvas_designs;
create trigger on_canvas_designs_update
  before update on canvas_designs
  for each row execute procedure public.set_ecommerce_updated_at();
