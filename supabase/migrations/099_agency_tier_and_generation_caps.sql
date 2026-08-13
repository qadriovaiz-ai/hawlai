-- Migration 099: Rename the 'max' tier to 'agency', reprice it to
-- ₹50,000/mo, and add per-month generation caps for image/video/voice/
-- brand-kit/website-build tools — flagged by the cost-margin audit as
-- uncapped on every tier, including Free.
-- Run this manually in the Supabase SQL Editor (migrations are never
-- auto-applied on deploy). Paste and run this whole file as ONE script —
-- Postgres runs a multi-statement script sent as a single query in one
-- implicit transaction, which matters here specifically: getDealershipPlanLimits()
-- resolves a dealership's limits by joining dealerships.plan -> plan_limits.plan
-- on exact string equality and falls back to Free-tier limits if no row
-- matches. If the plan_limits rename and the dealerships rename landed as
-- two separate script runs, any top-tier dealership read in the gap between
-- them would silently fall back to Free-tier limits. Running them together
-- is what prevents that.

-- 1. New per-month generation-usage caps on plan_limits. null = unlimited,
--    matching the existing convention used by messages_per_day /
--    team_seats / ad_campaigns_active.
alter table plan_limits add column if not exists images_per_month integer;
alter table plan_limits add column if not exists videos_per_month integer;
alter table plan_limits add column if not exists voiceover_chars_per_month integer;
alter table plan_limits add column if not exists brand_kits_per_month integer;
alter table plan_limits add column if not exists website_builds_per_month integer;

-- 2. Rename the 'max' plan_limits row to 'agency' and reprice it.
update plan_limits set plan = 'agency', price_inr = 50000 where plan = 'max';

-- 3. Move every existing dealership on 'max' to 'agency', in the same
--    script run as step 2 above — this is the atomicity the rename audit
--    called for.
update dealerships set plan = 'agency' where plan = 'max';

-- 4. Cap values per tier, from the cost-margin audit's real per-unit
--    provider costs (Gemini image ₹3.39, Veo video ₹278.40/8s clip,
--    ElevenLabs ₹8.70/1k chars, brand kit ₹4.44/generation, website
--    build ₹38.70/generation, all at the app's own ₹87/$1 FX rate).
--    Agency's website_builds_per_month is left null (unlimited) — the
--    same convention this tier already uses for messages_per_day and
--    ad_campaigns_active.
update plan_limits set
  images_per_month = 3, videos_per_month = 0, voiceover_chars_per_month = 2000,
  brand_kits_per_month = 1, website_builds_per_month = 1
where plan = 'free';

update plan_limits set
  images_per_month = 20, videos_per_month = 1, voiceover_chars_per_month = 10000,
  brand_kits_per_month = 2, website_builds_per_month = 2
where plan = 'basic';

update plan_limits set
  images_per_month = 60, videos_per_month = 5, voiceover_chars_per_month = 30000,
  brand_kits_per_month = 3, website_builds_per_month = 3
where plan = 'pro';

update plan_limits set
  images_per_month = 100, videos_per_month = 20, voiceover_chars_per_month = 50000,
  brand_kits_per_month = 5, website_builds_per_month = null
where plan = 'agency';
