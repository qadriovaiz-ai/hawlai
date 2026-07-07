-- ============================================================
-- Analytics Agent — lead-to-campaign attribution
-- ============================================================
-- To compute cost-per-lead per campaign, we need to know which
-- campaign/ad each lead actually came from. The Meta lead webhook
-- payload includes this, it just wasn't being captured.

alter table leads add column if not exists meta_campaign_id text;
alter table leads add column if not exists meta_ad_id text;

create index if not exists idx_leads_meta_campaign_id on leads(meta_campaign_id);
