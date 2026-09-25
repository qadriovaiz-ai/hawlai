-- ============================================================
-- Hawlai Brain, Phase 0: which piece of content produced what.
--
-- WHY: the brain's own loop is EXECUTION -> ANALYTICS -> LEARN ->
-- REMEMBER -> NEXT BEST ACTION, and today it stops dead at ANALYTICS.
-- content_pieces.strategy_week (migration 195) records that a piece was
-- CREATED from a week of the plan. page_events records views and clicks
-- by slug and variant. lead_touchpoints records the CHANNEL a lead came
-- through (migrations 112/113). Nothing anywhere joins a lead back to
-- the piece of content that brought it — so "case studies bring better
-- leads than reels" is not a thing Hawlai can know, only guess.
--
-- This is the join, and nothing more: one column on the two tables that
-- already carry the visitor's trail, filled from a ?hw= parameter on the
-- links Hawlai puts in its own content. Channel attribution (utm_*) is
-- untouched and still answers a different question — this says WHICH
-- POST, that says WHICH CHANNEL.
--
-- Consent: the piece id says which content someone came from, not who
-- they are — the same class of fact as `variant`, which is stored for
-- every event. Tying it to a person still needs visitor_id, which stays
-- consent-gated exactly as before (migration 152), so the lead-level
-- bridge below only runs for a visitor who consented.
--
-- on delete set null, not cascade: deleting a draft must never delete
-- the record of a real visit or a real lead's history.
-- ============================================================

alter table page_events
  add column if not exists content_piece_id uuid references content_pieces(id) on delete set null;

alter table lead_touchpoints
  add column if not exists content_piece_id uuid references content_pieces(id) on delete set null;

-- Reading is always "this business, this piece, this window".
create index if not exists idx_page_events_piece
  on page_events(dealership_id, content_piece_id, created_at desc)
  where content_piece_id is not null;

create index if not exists idx_lead_touchpoints_piece
  on lead_touchpoints(dealership_id, content_piece_id)
  where content_piece_id is not null;

-- No policy changes: both tables are already scoped to the owning
-- business (migrations 041 and 112), and this adds no new way in.
