-- Real interactive 3D — Opus generates a complete, self-contained
-- Three.js scene (HTML/CSS/JS) from a prompt, rendered live in a
-- sandboxed iframe. Genuinely different from the Canvas Editor
-- (2D, deterministic, built entirely by hand with fabric.js) — this
-- is AI-authored WebGL code, closer to what Claude Design's
-- "frontier design" does. Honest caveat carried in the UI, not just
-- this comment: generated Three.js code can fail to render or have
-- bugs, since it's genuinely generative rather than a fixed, tested
-- code path.
create table if not exists three_d_scenes (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  name text not null default 'Untitled 3D scene',
  prompt text not null,
  html_code text, -- the full self-contained HTML page (Three.js from CDN + generated scene script)
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error_message text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_three_d_scenes_dealership_id on three_d_scenes(dealership_id);

alter table three_d_scenes enable row level security;
drop policy if exists "three_d_scenes_dealership_all" on three_d_scenes;
create policy "three_d_scenes_dealership_all" on three_d_scenes
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
