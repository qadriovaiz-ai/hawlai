-- Real persona-based Meta ad targeting.
--
-- Before this, adlaunch/route.ts sent Meta only: a single city (25km
-- hardcoded) or country="IN", plus a hardcoded age_min:21 and
-- Advantage Audience. brand_profiles.target_persona
-- (age_range/income/concerns) was generated and used for ad COPY but
-- never reached actual targeting. Gender didn't exist at all.
--
-- ad_creatives.targeting_city is a single text column and cannot hold
-- multi-city / state / radius / age / gender / interest targeting.
-- Additive by design: targeting_city is KEPT unchanged (existing rows
-- and the campaigns-list display both read it), and targeting_json
-- holds the full resolved spec for anything launched through the new
-- flow.
--
-- gender needed NO schema change — target_persona is already jsonb,
-- so it's just a new key.

alter table ad_creatives add column if not exists targeting_json jsonb;
