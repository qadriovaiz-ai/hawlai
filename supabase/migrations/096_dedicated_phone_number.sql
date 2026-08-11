-- Migration 096: Per-business dedicated Vapi phone number — schema and
-- gating structure only. Wires the plumbing for the dedicated_phone_number
-- feature (see plans.ts/featureGate.ts) so that once real numbers can be
-- provisioned, turning the feature on is just an UPDATE and a
-- requireFeature() check, not a schema change.
--
-- NOT enforced yet — dedicated_phone_number is seeded true for pro/max
-- exactly like migration 086 did for affiliate_marketing/retargeting, but
-- no API route calls requireFeature() for this key yet (see the comment
-- on GATED_FEATURE_MIN_PLAN.dedicatedPhoneNumber in plans.ts). No real
-- numbers are provisioned by this migration either — DLT telecom
-- registration is still pending, and provisioning stays admin-assigned
-- (a manual `update dealerships set vapi_phone_number_id = ...` in the
-- Supabase SQL editor once a real number exists), not self-serve.

-- 1. Per-dealership Vapi overrides. Both null (the default for every
--    existing and new row) means "use the shared platform default" —
--    VAPI_PHONE_NUMBER_ID / VAPI_ASSISTANT_ID env vars, exactly today's
--    behavior. vapi_assistant_id is optional: a business can get its own
--    number while still using the shared platform assistant/voice.
alter table dealerships add column if not exists vapi_phone_number_id text;
alter table dealerships add column if not exists vapi_assistant_id text;

comment on column dealerships.vapi_phone_number_id is 'Admin-assigned dedicated Vapi phoneNumberId for this business''s outbound/inbound calls. Null = shared platform default (VAPI_PHONE_NUMBER_ID env var).';
comment on column dealerships.vapi_assistant_id is 'Admin-assigned dedicated Vapi assistantId (voice/transcriber config) for this business. Null = shared platform default (VAPI_ASSISTANT_ID env var).';

-- 2. Gated feature flag, same pattern as migration 086.
alter table plan_limits add column if not exists dedicated_phone_number boolean not null default false;

update plan_limits set dedicated_phone_number = true where plan in ('pro', 'max');
