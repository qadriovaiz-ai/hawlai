-- Migration 079: New 4-tier pricing structure (Free / Basic / Pro / Max)
-- Finalized 7 Aug 2026 — see Hawlai_Pricing_Final.md for the full reasoning.
--
-- Replaces the old 'free' | 'growth' | 'pro' labels with the new
-- 'free' | 'basic' | 'pro' | 'max' tiers and their real limits.
-- Run this manually in the Supabase SQL Editor (migrations are never
-- auto-applied on deploy).

-- 1. Update the dealerships.plan check/default to the new tier names.
--    (No CHECK constraint existed before, so this just documents intent —
--    add a real CHECK constraint if you want the DB to enforce valid values.)
alter table dealerships alter column plan set default 'free';

-- 2. Plan limits table — one row per tier, holds every numeric limit so
--    the app reads limits from data instead of hardcoding them in code.
--    This also makes it trivial to change a limit later without a deploy.
create table if not exists plan_limits (
  plan text primary key, -- 'free' | 'basic' | 'pro' | 'max'
  price_inr integer not null,
  messages_per_day integer, -- null = unlimited
  team_seats integer, -- null = unlimited
  ad_campaigns_active integer, -- null = unlimited
  calling_free_minutes integer not null default 0,
  calling_margin_inr numeric(6,2) not null default 2.00, -- added on top of live Vapi cost/min
  opus_access text not null default 'none', -- 'none' | 'limited' | 'full'
  whatsapp_automation boolean not null default false,
  business_reports boolean not null default false,
  marketing_automation_workflows boolean not null default false,
  competitor_intel boolean not null default false,
  growth_advisor boolean not null default false,
  cro boolean not null default false,
  influencer_marketing boolean not null default false,
  three_d_studio boolean not null default false,
  multi_business boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into plan_limits (
  plan, price_inr, messages_per_day, team_seats, ad_campaigns_active,
  calling_free_minutes, calling_margin_inr, opus_access,
  whatsapp_automation, business_reports, marketing_automation_workflows,
  competitor_intel, growth_advisor, cro, influencer_marketing,
  three_d_studio, multi_business
) values
  ('free',  0,     100,  1,    0,    0,   2.00, 'none',    false, false, false, false, false, false, false, false, false),
  ('basic', 1999,  200,  2,    5,    50,  2.00, 'none',    true,  true,  false, false, false, false, false, false, false),
  ('pro',   7999,  1000, 5,    15,   200, 2.00, 'limited', true,  true,  true,  true,  true,  true,  true,  false, false),
  ('max',   20000, null, null, null, 500, 0.50, 'full',    true,  true,  true,  true,  true,  true,  true,  true,  true)
on conflict (plan) do update set
  price_inr = excluded.price_inr,
  messages_per_day = excluded.messages_per_day,
  team_seats = excluded.team_seats,
  ad_campaigns_active = excluded.ad_campaigns_active,
  calling_free_minutes = excluded.calling_free_minutes,
  calling_margin_inr = excluded.calling_margin_inr,
  opus_access = excluded.opus_access,
  whatsapp_automation = excluded.whatsapp_automation,
  business_reports = excluded.business_reports,
  marketing_automation_workflows = excluded.marketing_automation_workflows,
  competitor_intel = excluded.competitor_intel,
  growth_advisor = excluded.growth_advisor,
  cro = excluded.cro,
  influencer_marketing = excluded.influencer_marketing,
  three_d_studio = excluded.three_d_studio,
  multi_business = excluded.multi_business,
  updated_at = now();

-- 3. Daily message usage tracker (separate from the existing
--    api_usage_logs, which logs every call for cost analysis — this
--    table is specifically for the fast "how many messages left today"
--    check without scanning the full log table).
create table if not exists daily_message_usage (
  dealership_id uuid not null references dealerships(id) on delete cascade,
  usage_date date not null default current_date,
  message_count integer not null default 0,
  primary key (dealership_id, usage_date)
);

-- 4. Calling minutes usage per billing month — tracks free minutes used
--    and any extra minutes that should be charged at plan_limits'
--    calling_margin_inr + live Vapi cost/min.
create table if not exists calling_minutes_usage (
  dealership_id uuid not null references dealerships(id) on delete cascade,
  billing_month date not null default date_trunc('month', current_date), -- always the 1st of the month
  minutes_used numeric(10,2) not null default 0,
  extra_minutes_charged numeric(10,2) not null default 0,
  extra_charge_inr numeric(10,2) not null default 0,
  primary key (dealership_id, billing_month)
);

comment on table plan_limits is 'Source of truth for all tier limits — read by billing UI and feature-gating checks. Update this table (not code constants) when pricing changes.';
comment on table daily_message_usage is 'Fast daily counter for Master Chat message limits, reset by usage_date. Separate from api_usage_logs which is the full audit trail.';
comment on table calling_minutes_usage is 'Monthly AI calling minutes per business, used to compute extra-minute charges transparently on the billing page.';
