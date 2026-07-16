-- Video Marketing department — text/planning outputs (ideas, scripts,
-- captions, subtitles, B-roll lists, animation concepts, editing shot
-- lists). Actual AI video generation (Veo) and voiceover (ElevenLabs)
-- already exist in Creative Studio — this table only covers the new
-- text-based tasks, kept separate from content_pieces since these are
-- a distinct workflow (video pre-production, not publishable posts).

create table if not exists video_marketing_pieces (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- e.g. 'video_ideas', 'reel_script', 'subtitles'
  topic text,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_video_marketing_pieces_dealership_id on video_marketing_pieces(dealership_id);

alter table video_marketing_pieces enable row level security;

create policy "video_marketing_pieces_dealership_all" on video_marketing_pieces
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
