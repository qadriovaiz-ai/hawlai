-- ============================================================
-- Autopilot Mode — pre-drafted content
-- ============================================================
-- The daily autopilot job prepares follow-up messages for stuck
-- leads ahead of time, so by the time a dealer opens the Call Queue
-- in the morning, the message is already written — they just review
-- and send. Nothing sends automatically; this only prepares drafts.

alter table leads add column if not exists draft_followup_message text;
alter table leads add column if not exists draft_followup_generated_at timestamptz;
