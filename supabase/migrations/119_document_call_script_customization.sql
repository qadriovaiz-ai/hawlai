-- Migration 119: Documentation-only backfill.
--
-- dealerships.custom_call_instructions and custom_first_message were
-- proposed and run directly in Supabase during the "AI Calling script
-- customization" work (see commit adding CallScriptSettings.tsx /
-- src/app/api/settings/call-script/route.ts), before this migration
-- file existed. No file was written for it at the time — this file
-- exists only so the migrations folder stays a complete record of
-- schema history. The columns are already live; DO NOT RE-RUN this
-- against production. The statements below are idempotent (IF NOT
-- EXISTS) purely as a safety net, not an instruction to run them.

alter table dealerships add column if not exists custom_call_instructions text;
alter table dealerships add column if not exists custom_first_message text;
