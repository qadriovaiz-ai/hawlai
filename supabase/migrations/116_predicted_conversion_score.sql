-- ============================================================
-- AI-Intelligence Pillar 3 — predicted lead conversion score.
--
-- Separate from the existing leads.ai_score (a static, one-time
-- intake estimate set at creation). This is a behavioral score,
-- recomputed daily as the lead's real activity unfolds. Nullable —
-- unresolved for a lead until the first daily cron run scores it.
-- ============================================================

alter table leads add column if not exists predicted_conversion_score integer;
