-- ============================================================
-- Phase 4: AI Video Generation (Veo)
-- ============================================================
-- Video generation is a long-running async operation (1-3+ minutes),
-- so this tracks it as a job: start it, poll it, store the result
-- once ready — rather than holding a request open that whole time.

create table if not exists video_generations (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  prompt text not null,
  operation_name text,
  status text default 'pending' check (status in ('pending', 'ready', 'failed')),
  video_url text,
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_video_generations_dealership on video_generations(dealership_id);

alter table video_generations enable row level security;

create policy "video_generations_dealership_all" on video_generations
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
