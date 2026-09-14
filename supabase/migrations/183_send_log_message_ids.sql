-- ============================================================
-- Tie automated email sends to what happened to them.
--
-- The health card judged Welcome & Follow-up Emails and Custom Workflows
-- by whether the daily job ran — "100% success" with nothing ever sent.
-- It now counts real sends, and with the Resend message id on each log
-- row it can also count which were delivered and which bounced, were
-- marked as spam, failed or were suppressed (email_sends.delivery_status,
-- migration 182). Gmail sends have no Resend id and show as sent only.
-- ============================================================

alter table email_automation_log add column if not exists resend_message_id text;
alter table workflow_step_runs add column if not exists resend_message_id text;
