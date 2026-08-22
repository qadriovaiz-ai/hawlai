-- Usage/Pricing/Cost-Control spec — Phase 1, piece 1 (centralized
-- plan config): new 'growth' tier + repricing per the confirmed final
-- pricing, plus provider_costs (Section 8/24).
--
-- Safe as a plain data change: no paying customers exist yet, and no
-- dealership is on 'growth' (it didn't exist before this), so nothing
-- is being moved between plans.

-- Part A: repricing. Free (₹0) and Basic (₹1,999) were already correct.
update plan_limits set price_inr = 14999 where plan = 'pro';
update plan_limits set price_inr = 49999 where plan = 'agency';

-- Included calling minutes, per the new document's numbers. Agency
-- keeps its ₹0.50/min margin — a deliberate volume discount
-- (migration 099), explicitly retained rather than standardised to
-- ₹2 like every other paid tier.
update plan_limits set calling_free_minutes = 30   where plan = 'basic';
update plan_limits set calling_free_minutes = 750  where plan = 'pro';
update plan_limits set calling_free_minutes = 2000 where plan = 'agency';
-- 'free' stays at 0 included minutes, unchanged.

-- New 'growth' tier, positioned between basic and pro. Every column
-- is set explicitly rather than relying on defaults, so a future
-- column addition can't silently leave this row inconsistent.
insert into plan_limits (
  plan, price_inr, messages_per_day, team_seats, ad_campaigns_active,
  calling_free_minutes, calling_margin_inr, opus_access,
  whatsapp_automation, business_reports, marketing_automation_workflows,
  competitor_intel, growth_advisor, cro, influencer_marketing,
  three_d_studio, multi_business,
  affiliate_marketing, retargeting, dedicated_phone_number,
  images_per_month, videos_per_month, voiceover_chars_per_month,
  brand_kits_per_month, website_builds_per_month,
  videos_per_day, voiceover_chars_per_day
) values (
  'growth', 3999, 500, 3, 10,
  100, 2.00, 'none',
  true, true, true,
  false, false, false, false,
  false, false,
  false, false, false,
  35, 3, 20000,
  2, 2,
  1, 10000
) on conflict (plan) do update set
  price_inr = excluded.price_inr,
  calling_free_minutes = excluded.calling_free_minutes;

-- Part B: provider_costs — Section 8/24. Provider rates currently live
-- hardcoded in src/lib/usage/pricing.ts; this makes them configurable
-- without a deploy, which is the spec's actual requirement. Left
-- UNSEEDED here deliberately — Perplexity's real pricing hasn't been
-- verified from their official docs yet (Phase 2's Cost Engine seeds
-- this table from verified rates, never guessed numbers).
create table if not exists provider_costs (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,          -- 'anthropic' | 'gemini' | 'perplexity' | 'vapi' | 'elevenlabs'
  service text not null,           -- 'llm' | 'research' | 'calling' | 'tts' | 'image' | 'video'
  model text,                      -- null when the rate isn't model-specific
  input_cost_usd numeric(12,6),    -- per 1M input tokens
  output_cost_usd numeric(12,6),   -- per 1M output tokens
  search_cost_usd numeric(12,6),   -- per search/request (Perplexity)
  per_minute_cost_usd numeric(12,6), -- calling
  per_unit_cost_usd numeric(12,6),   -- per image/video/1k chars
  effective_from timestamptz not null default now(),
  effective_until timestamptz,     -- null = currently active
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_provider_costs_lookup
  on provider_costs(provider, service, model, effective_from desc);

alter table provider_costs enable row level security;
-- Platform-internal pricing data, not per-dealership: admin-only read,
-- writes via service role. Never exposed to customers (Section 16).
create policy "provider_costs_admin_select" on provider_costs
  for select using (
    exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  );
