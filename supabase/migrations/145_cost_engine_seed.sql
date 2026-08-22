-- Cost Engine seed — Usage/Pricing/Cost-Control spec, Phase 2 piece 2
-- (Section 8/24). Seeds provider_costs (created empty in migration 143)
-- with the REAL rates already used by src/lib/usage/pricing.ts
-- (Claude, Vapi, Gemini, ElevenLabs — all previously verified, none
-- guessed) plus Perplexity's real Sonar API pricing, freshly verified
-- from Perplexity's own docs (docs.perplexity.ai/getting-started/pricing)
-- and cross-checked against independent trackers on 2026-08-22 —
-- never hardcoded from assumption, per the spec's own closing rule.

alter table provider_costs add constraint provider_costs_unique_rate unique (provider, service, model);

insert into provider_costs (provider, service, model, input_cost_usd, output_cost_usd, search_cost_usd, per_minute_cost_usd, per_unit_cost_usd, notes) values
  ('anthropic', 'llm', 'claude-opus-4-8', 5.0, 25.0, null, null, null, 'Per 1M tokens. Mirrors CLAUDE_MODELS.premium in pricing.ts.'),
  ('anthropic', 'llm', 'claude-sonnet-4-6', 3.0, 15.0, null, null, null, 'Per 1M tokens. Mirrors CLAUDE_MODELS.standard in pricing.ts.'),
  ('anthropic', 'llm', 'claude-haiku-4-5-20251001', 1.0, 5.0, null, null, null, 'Per 1M tokens. Mirrors CLAUDE_MODELS.fast in pricing.ts.'),
  ('vapi', 'calling', null, null, null, null, 0.09, null, 'Blended per-minute cost, as shown on the Vapi dashboard for the assistant/voice/model combination in use.'),
  ('gemini', 'image', 'gemini-2.5-flash-image', null, null, null, null, 0.039, 'Per output image up to 1024x1024. $30/M output tokens at 1290 tokens/image, published as a flat per-image rate.'),
  ('gemini', 'video', 'veo-3.1', null, null, null, null, 0.40, 'Per second (per_unit_cost_usd here means per-second for this row, not per-minute). Default clip length 8s.'),
  ('elevenlabs', 'tts', 'eleven_multilingual_v2', null, null, null, null, 0.1, 'Per 1,000 characters, pay-as-you-go rate.'),
  -- Perplexity — used only for COMPLEX/DEEP research (see
  -- src/lib/research/researchRouter.ts). Code-ready-but-inactive until
  -- PERPLEXITY_API_KEY is set.
  ('perplexity', 'research', 'sonar-pro', 3.0, 15.0, 0.014, null, null,
    'Real rate: $3/M input, $15/M output. Per-request search fee genuinely varies $6-$14 per 1,000 requests by search_context_size (low/medium/high); this app does not set an explicit context size, so the TOP of that range ($14/1000 = $0.014/request) is stored deliberately, to never undercharge.'),
  ('perplexity', 'research', 'sonar-deep-research', 2.0, 8.0, 0.005, null, null,
    'Real base rate: $2/M input, $8/M output, +$5/1000 search queries. Deep Research also separately bills $2/M citation tokens and $3/M reasoning tokens beyond the base output rate, not representable in this schema''s plain input/output shape. costOfPerplexityCallInr() approximates by billing all output at the higher $3/M reasoning rate rather than $8/M base — a deliberate overestimate. No call site uses this model yet; revisit if/when Deep Research is wired to a real feature.')
on conflict (provider, service, model) do update set
  input_cost_usd = excluded.input_cost_usd,
  output_cost_usd = excluded.output_cost_usd,
  search_cost_usd = excluded.search_cost_usd,
  per_minute_cost_usd = excluded.per_minute_cost_usd,
  per_unit_cost_usd = excluded.per_unit_cost_usd,
  notes = excluded.notes;
