-- ============================================================
-- Per-campaign revenue/sales tracking
-- ============================================================
-- leads.meta_campaign_id (which ad a lead came from) and
-- leads.deal_value (revenue once converted) already existed
-- separately — this connects them so revenue/ROAS/units-sold can be
-- attributed back to the specific campaign that generated the lead,
-- not just shown as one dealership-wide total.

alter table campaign_performance_history add column if not exists revenue numeric default 0;
alter table campaign_performance_history add column if not exists conversions integer default 0;
alter table campaign_performance_history add column if not exists roas numeric;
