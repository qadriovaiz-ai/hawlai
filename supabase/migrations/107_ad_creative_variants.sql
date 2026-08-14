-- ============================================================
-- Master audit Part D — creative variant testing.
--
-- The generator already produces multiple ad-copy angles
-- (creativeAgent.generateCopyVariations, retargetingAgent's
-- variant2*), the scorer already rates a creative pre-launch
-- (ad_creatives.creative_score, migration 011), and
-- campaign_performance_history already snapshots per-creative spend/
-- leads/revenue daily. The only missing piece was that two creatives
-- launched from the same idea were unrelated rows, so nothing could
-- compare them.
--
-- Two nullable columns rather than a new experiments table: a variant
-- group IS just "these creatives were launched together", and
-- ad_creatives already carries everything else needed. No winner
-- column on purpose — declaring a winner means pausing the loser, and
-- setCampaignStatus() already owns that; a winner flag here would be
-- a second, drift-prone source of truth about which ad is live.
-- ============================================================

alter table ad_creatives add column if not exists variant_group_id uuid;
alter table ad_creatives add column if not exists variant_label text;

create index if not exists idx_ad_creatives_variant_group
  on ad_creatives(variant_group_id) where variant_group_id is not null;
