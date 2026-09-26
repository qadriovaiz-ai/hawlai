-- ============================================================
-- Whether an AI assistant names this business, tracked over time
-- (Brain, Phase 1b).
--
-- The AEO check already runs, already uses live web search, and already
-- says honestly that it SIMULATES what an assistant would answer rather
-- than querying ChatGPT or Gemini directly. What it could never do is
-- show movement: it asked the model to invent its own questions each
-- run, so this week's "not mentioned" and last week's were answers to
-- different questions. One row per question per run, against a question
-- set that is now fixed in code (lib/seo/aeoQuestions.ts), is what makes
-- "we started getting named for this" a thing anyone can see.
--
-- Deliberately its own table rather than more jsonb inside
-- seo_toolkit_items: the whole value here is comparing the same question
-- across runs, which means it has to be a column.
--
-- `mentioned` is what the check found, not a promise about any
-- particular assistant — the disclosure on the check itself still
-- applies and is shown wherever this is.
-- ============================================================

create table if not exists aeo_presence (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  -- One id per check, so a run's questions are read together.
  run_id uuid not null,
  run_at timestamptz not null default now(),
  question text not null,
  mentioned boolean not null,
  -- Who was named instead, or alongside.
  competitors jsonb not null default '[]'::jsonb,
  -- The run's overall citability score, carried so a trend can be drawn
  -- without joining back to seo_toolkit_items.
  score integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_aeo_presence_question
  on aeo_presence(dealership_id, question, run_at desc);
create index if not exists idx_aeo_presence_run
  on aeo_presence(dealership_id, run_at desc);

alter table aeo_presence enable row level security;
drop policy if exists "aeo_presence_owner_read" on aeo_presence;
create policy "aeo_presence_owner_read" on aeo_presence
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
-- Written by the server only.
