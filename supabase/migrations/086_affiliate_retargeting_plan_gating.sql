-- Migration 086: Add Affiliate Marketing and Retargeting as Pro-tier
-- gated features, same tier as Influencer Marketing.

alter table plan_limits add column if not exists affiliate_marketing boolean not null default false;
alter table plan_limits add column if not exists retargeting boolean not null default false;

update plan_limits set affiliate_marketing = true, retargeting = true where plan in ('pro', 'max');
