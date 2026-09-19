-- ============================================================
-- A positioning run works in the background, one step per invocation.
--
-- WHY (2026-09-19): "Compare with competitors" answered 504 every time.
-- Collecting ran discovery and then a second wave of competitor web
-- searches inside one request — each web-search call takes 15–40 seconds,
-- so two waves ran past Vercel's 60-second limit.
--
-- Now the button answers at once and the run carries itself on, like the
-- daily automation run: step 0 finds competitors, steps 1..N read one
-- competitor each, then sorting, then writing — each in its own
-- invocation, well inside 60 seconds. The page polls and shows progress.
--
--   status        running → analysed, or failed (with `error`)
--   step          which step is next
--   step_running  a step is claimed, so a duplicate hand-over can't run it twice
--   updated_at    a running row that stops moving is shown as stopped, not
--                 left spinning
-- ============================================================

alter table competitor_positioning drop constraint if exists competitor_positioning_status_check;
alter table competitor_positioning add constraint competitor_positioning_status_check
  check (status in ('running', 'collected', 'analysed', 'failed'));

alter table competitor_positioning add column if not exists step integer not null default 0;
alter table competitor_positioning add column if not exists step_running boolean not null default false;
alter table competitor_positioning add column if not exists error text;
alter table competitor_positioning add column if not exists updated_at timestamptz not null default now();
