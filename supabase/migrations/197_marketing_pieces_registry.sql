-- ============================================================
-- One identity for anything Hawlai publishes (Brain, Phase 0).
--
-- Migration 196 hung attribution off content_pieces directly. That was
-- right for one department and wrong for the other four: an email lives
-- in email_marketing_pieces, a WhatsApp draft in
-- whatsapp_marketing_pieces, and a foreign key can only point at one
-- table.
--
-- THE SHAPE, and why this one:
--   - A column per department (email_piece_id, whatsapp_piece_id, …)
--     keeps the foreign keys, but adds two nullable columns to the two
--     tracking tables for every department that ever publishes, and the
--     read model has to coalesce across all of them forever.
--   - source_table + source_id needs no new table, but has NO foreign
--     key, so nothing stops a row pointing at something that never
--     existed — and the ownership check, which is what keeps one
--     business's traffic off another's content, would have to look up a
--     table named by the request. That is the last query you want
--     attacker-influenced.
--   - A registry keeps ONE column with a real foreign key, one static
--     ownership query, and answers something the Brain needs later
--     anyway: everything this business has published, of what kind,
--     when. The quarter review and the content-performance work both
--     want exactly that list.
-- The cost is one row written when a piece is published. That is the
-- trade taken here.
--
-- 196's column is carried over and then dropped, not abandoned: nothing
-- that was already recorded is lost.
-- ============================================================

create table if not exists marketing_pieces (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  -- What kind of thing was published. 'autopilot' is content posted with
  -- nobody reviewing it, kept distinct from 'content' so the difference
  -- stays visible in results.
  kind text not null check (kind in ('content', 'email', 'whatsapp', 'autopilot')),
  source_table text not null,
  source_id uuid not null,
  -- The topic or subject, so results read as words rather than ids.
  label text,
  created_at timestamptz not null default now(),
  -- Registering the same piece twice is the same piece.
  unique (dealership_id, source_table, source_id)
);

create index if not exists idx_marketing_pieces_dealership
  on marketing_pieces(dealership_id, created_at desc);

alter table marketing_pieces enable row level security;
drop policy if exists "marketing_pieces_owner_read" on marketing_pieces;
create policy "marketing_pieces_owner_read" on marketing_pieces
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
-- Written by the server only, like every other attribution row.

alter table page_events
  add column if not exists marketing_piece_id uuid references marketing_pieces(id) on delete set null;
alter table lead_touchpoints
  add column if not exists marketing_piece_id uuid references marketing_pieces(id) on delete set null;

-- Carry over whatever migration 196 recorded before dropping its column.
insert into marketing_pieces (dealership_id, kind, source_table, source_id, label)
select distinct cp.dealership_id, 'content', 'content_pieces', cp.id, cp.topic
from content_pieces cp
where cp.id in (
  select content_piece_id from page_events where content_piece_id is not null
  union
  select content_piece_id from lead_touchpoints where content_piece_id is not null
)
on conflict (dealership_id, source_table, source_id) do nothing;

update page_events pe
  set marketing_piece_id = mp.id
  from marketing_pieces mp
  where mp.source_table = 'content_pieces'
    and mp.source_id = pe.content_piece_id
    and pe.content_piece_id is not null;

update lead_touchpoints lt
  set marketing_piece_id = mp.id
  from marketing_pieces mp
  where mp.source_table = 'content_pieces'
    and mp.source_id = lt.content_piece_id
    and lt.content_piece_id is not null;

drop index if exists idx_page_events_piece;
drop index if exists idx_lead_touchpoints_piece;
alter table page_events drop column if exists content_piece_id;
alter table lead_touchpoints drop column if exists content_piece_id;

create index if not exists idx_page_events_piece
  on page_events(dealership_id, marketing_piece_id, created_at desc)
  where marketing_piece_id is not null;
create index if not exists idx_lead_touchpoints_piece
  on lead_touchpoints(dealership_id, marketing_piece_id)
  where marketing_piece_id is not null;
