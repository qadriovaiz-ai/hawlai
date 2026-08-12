-- Phase 3: structured Brand Voice Profile, additive alongside the
-- existing flat tone_of_voice text column (kept exactly as-is — still
-- the plain-English summary shown in Settings -> Brand Voice). Nullable,
-- no default, no backfill: businesses without a brand_voice row yet get
-- a safe profile derived in code from their existing tone_of_voice
-- string (see deriveBrandVoiceFallback() in src/lib/agents/brandVoice.ts)
-- rather than a bulk data migration that could partially fail mid-run.
alter table brand_profiles add column if not exists brand_voice jsonb;
