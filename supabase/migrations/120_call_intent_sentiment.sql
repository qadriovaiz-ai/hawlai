-- Migration 120: Structured intent/sentiment/urgency on calls —
-- Phase 1 piece 3 of the AI Communication Employee foundation.
--
-- Today callScoringAgent.ts's entire structured output is
-- {score, temperature, reason} — a single hot/warm/cold classification
-- plus one free-text sentence. This adds real structured signal
-- per-call, distinct from leads.lead_temperature/ai_score/
-- qualification_reason (which stay as the lead's latest cumulative
-- state, overwritten by whichever call was most recent — a different
-- concept from a single call's own classification).

alter table calls add column if not exists intent text check (intent in ('interested', 'not_interested', 'requesting_info', 'ready_to_book', 'complaint', 'no_real_conversation', 'other'));
alter table calls add column if not exists sentiment text check (sentiment in ('positive', 'neutral', 'negative'));
alter table calls add column if not exists urgency text check (urgency in ('high', 'medium', 'low'));
