-- ============================================================
-- Master audit Part B1 — Outcome/Learning Feedback Loop.
--
-- business_memory (migration 089) has always been freeform text with
-- no link to what actually produced it. These two nullable columns
-- let an auto-written insight point back at the real record (lead,
-- call, ad_creative, campaign) that generated it, without disturbing
-- any existing row (both null by default) or the manual/chat write
-- paths, which simply never set them.
-- ============================================================

alter table business_memory add column if not exists related_entity_type text
  check (related_entity_type in ('lead', 'call', 'ad_creative', 'campaign'));
alter table business_memory add column if not exists related_entity_id uuid;
