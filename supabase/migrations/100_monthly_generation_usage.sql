-- Migration 100: monthly usage counters backing the per-month generation
-- caps added in migration 099 (images_per_month, videos_per_month,
-- voiceover_chars_per_month, brand_kits_per_month, website_builds_per_month).
-- One shared table with a `resource` discriminator, same shape as
-- api_usage_logs's service/operation pattern, rather than five near-
-- identical tables. Bucketed by calendar month like calling_minutes_usage
-- (migration 079), not daily like daily_message_usage — these are monthly
-- caps. No RLS policy, same as daily_message_usage and
-- calling_minutes_usage — access is always through the service-role
-- client, scoped to an already-verified dealershipId (see
-- src/lib/usage/generationLimits.ts).

create table if not exists monthly_generation_usage (
  dealership_id uuid not null,
  resource text not null, -- 'image' | 'video' | 'voiceover_chars' | 'brand_kit' | 'website_build'
  billing_month date not null,
  count numeric not null default 0, -- generation count, or character count for voiceover_chars
  updated_at timestamptz not null default now(),
  primary key (dealership_id, resource, billing_month)
);
