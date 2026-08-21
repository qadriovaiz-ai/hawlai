-- Multi-platform ads — P3 piece 6
-- ad_creatives was Meta-shaped (meta_campaign_id/meta_adset_id/
-- meta_ad_id/meta_status). Made generic ONCE here so Google/LinkedIn/
-- Pinterest/Snapchat each cost a client + a route rather than another
-- 4 columns apiece.
--
-- meta_* columns are deliberately KEPT, not dropped — plenty of code
-- reads them, and the Meta path dual-writes both during the
-- transition so the two never diverge.

alter table ad_creatives add column if not exists platform text not null default 'meta'
  check (platform in ('meta','google','linkedin','pinterest','snapchat'));
alter table ad_creatives add column if not exists external_campaign_id text;
alter table ad_creatives add column if not exists external_adset_id text;
alter table ad_creatives add column if not exists external_ad_id text;
alter table ad_creatives add column if not exists external_status text;

-- Google Search ads need keywords; Display ads don't. Stored per
-- creative so the dealer's edits survive (AI suggests a starting
-- point, dealer keeps final control).
alter table ad_creatives add column if not exists ad_format text;
alter table ad_creatives add column if not exists keywords jsonb;

-- Existing rows are all Meta — backfill so the generic columns are
-- the single source of truth going forward.
update ad_creatives set
  external_campaign_id = meta_campaign_id,
  external_adset_id = meta_adset_id,
  external_ad_id = meta_ad_id,
  external_status = coalesce(meta_status, 'PAUSED')
where platform = 'meta';

create index if not exists idx_ad_creatives_platform on ad_creatives(dealership_id, platform);
