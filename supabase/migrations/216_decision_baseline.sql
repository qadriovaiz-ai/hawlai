-- 216: what the measure read BEFORE the decision — S5/P2b.
--
-- WHAT THIS COST, 3 November 2026. The results job reconstructed
-- "before" from timestamps: how many findings of this type were open on
-- the day of the decision. It was wrong twice over, and the founder's
-- first live check found it in one run.
--
--   1. Both windows resolved to the SAME INSTANT. `before` was counted
--      at the end of the decision's day and `after` at the end of
--      today, so a decision measured on the day it was made compared a
--      moment with itself. delta = 0 was guaranteed, not measured.
--
--   2. And no timestamp could have fixed it. For a suggestion acted on,
--      THE ACTION IS WHAT CHANGES THE MEASURE: the route resolves the
--      finding and writes the decision about fifty milliseconds later.
--      At the decision's own instant the finding is already closed, so
--      "before" reads zero — the opposite of the state the decision was
--      actually taken against.
--
-- I REJECTED THIS COLUMN WHEN PLANNING P2, and the reason I gave was
-- beside the point: that reconstruction is safe because opportunity
-- rows are never hard-deleted. True, and irrelevant. The problem was
-- never deletion; it is that an action and the record of it happen in
-- the same instant, so there is no earlier state left to read.
--
-- SO THE BASELINE IS RECORDED BY THE CALLER, BEFORE THE ACTION TAKES
-- EFFECT. True by construction instead of by reconstruction, and it
-- needs no new rule for each decision kind — which is what the cheaper
-- fix would have needed, and would have broken on the third kind.
--
-- NULLABLE, because plenty of decisions have no counted measure to take
-- a baseline of: an approval whose consequence this product does not
-- collect, a goal the owner wrote himself. A null baseline produces a
-- `not_measurable` outcome with its reason, which is what migration
-- 215's fourth verdict is for.

alter table decisions add column if not exists baseline numeric;

comment on column decisions.baseline is
  'What `measure` read immediately BEFORE this decision took effect, captured by the caller. NULL when there is no counted measure to read, which produces a not_measurable outcome rather than a guess. Recorded rather than reconstructed because an action and the record of it happen in the same instant — see this migration''s header for what that cost on 3 November 2026.';
