-- ============================================================
-- Creative Score
-- ============================================================
-- AdCreative.ai's biggest differentiator: every generated ad comes
-- with a predicted conversion score before launch, so the dealer
-- knows if it's worth launching or should be regenerated. Adding
-- the same to ad_creatives.

alter table ad_creatives add column if not exists creative_score integer;
alter table ad_creatives add column if not exists score_reasoning text;
