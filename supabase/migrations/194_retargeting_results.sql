-- ============================================================
-- Retargeting R5: what retargeting brought back, per audience.
--
-- An ad launched for a retargeting audience now records WHICH audience
-- (and tier) it was for, so orders and enquiries that came from its
-- campaign can be counted back to it — "Brought back: 3 orders · ₹4,200"
-- under that group on the Retargeting page.
--
-- The orders columns are added here because the storefront has been
-- writing them since the attribution work (lib/storefront/
-- resolveAttribution.ts) without a migration ever adding them: if the
-- live table already has them this changes nothing, and if it doesn't,
-- every attributed order has been losing its campaign silently.
-- ============================================================

alter table ad_creatives add column if not exists retarget_audience_key text;
create index if not exists idx_ad_creatives_retarget
  on ad_creatives(dealership_id, retarget_audience_key)
  where retarget_audience_key is not null;

alter table orders add column if not exists utm_campaign text;
alter table orders add column if not exists utm_source text;
alter table orders add column if not exists meta_campaign_id text;
create index if not exists idx_orders_meta_campaign on orders(dealership_id, meta_campaign_id);
