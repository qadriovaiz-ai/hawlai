-- ============================================================
-- Advanced Strategy step 5: closing the loop.
--
-- Two halves:
--   1. What the owner ACCEPTS from their positioning becomes part of the
--      Brand Voice every generator already reads: the pillars go into
--      brand_profiles.messaging_pillars, and the positioning statement
--      gets a column of its own (it isn't a pillar — it's the one
--      sentence the pillars serve).
--   2. A piece made from a week of the 90-day plan remembers which week
--      it came from, so next quarter can say what was actually done
--      rather than guessing from dates.
--
-- Nothing is written to a business's Brand Voice without the owner
-- pressing Replace or Add; these columns only give that click somewhere
-- to land.
-- ============================================================

alter table brand_profiles add column if not exists positioning_statement text;
-- When it was accepted, and from which comparison — so a later run can
-- say "this came from the comparison on 20 Sept", not just assert it.
alter table brand_profiles add column if not exists positioning_accepted_at timestamptz;

alter table content_pieces add column if not exists strategy_quarter_id uuid references strategy_quarters(id) on delete set null;
alter table content_pieces add column if not exists strategy_week integer;
create index if not exists idx_content_pieces_quarter
  on content_pieces(strategy_quarter_id, strategy_week)
  where strategy_quarter_id is not null;
