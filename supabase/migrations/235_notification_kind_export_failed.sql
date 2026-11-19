-- 235: the owner is told when a scheduled export does not go out.
--
-- WHY. A weekly leads export that fails on Monday fails SILENTLY, and
-- then fails again every Monday after that. The failure was recorded —
-- written to lead_export_log, and shown as "failing" on the Autopilot
-- page by buildExportHealth — but that is a screen somebody has to
-- open. The owner's only evidence is that the email never arrives,
-- which looks exactly like the feature not existing.
--
-- Flagged as "this business gets the weekly report and that one never
-- does". THE FLAG WAS NOT A BUG, and the queries below are what
-- settled it, on 19 November 2026: the second business had
-- lead_export_frequency = 'off' and the feature had simply never been
-- switched on. The business that has it set to 'weekly' has been
-- sending successfully, with zero failures on record.
--
-- This migration is kept anyway, and so is the notification it
-- enables, because the OTHER thing the investigation found is real:
-- every failure path was recorded and none was told to anybody. An
-- export that fails on Monday would keep failing every Monday with
-- nothing to show for it. That defect existed whether or not it was
-- the one flagged.
--
-- NOT email_delivery_problem. That kind is a BOUNCE, raised by the
-- Resend webhook after a send. This one never left.
--
-- Same extend-the-constraint pattern as 109/110/121/122/132/190/218/219/234,
-- and the list below is 234's with one value added. If 234 has not been
-- run yet, running this one alone is enough.

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'call_needs_follow_up',
    'variant_draft_generated',
    'call_escalated',
    'refund_requested',
    'goal_completed','goal_task_failed',
    'lead_merge_needs_review',
    'platform_spend_alert',
    'out_of_season_content',
    'email_delivery_problem',
    'platform_ai_unavailable',
    -- S7/P3 (migration 218).
    'autonomy_lowered',
    -- A connected account stopped working (migration 219).
    'integration_disconnected',
    -- Active on Meta, and it has never shown anybody anything.
    'campaign_not_delivering',
    -- A scheduled export the owner turned on did not go out.
    'scheduled_export_failed'
  ));

-- VERIFY. Expected: the constraint definition, containing
-- 'scheduled_export_failed'.
--
-- select pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'notifications_kind_check';
--
-- ─────────────────────────────────────────────────────────────────────
-- AND THE TWO QUERIES THAT SETTLE WHICH BUSINESS, AND WHY
-- ─────────────────────────────────────────────────────────────────────
--
-- Read-only. The first says whether the export is even switched on for
-- each business, and whether it has an owner to send to:
--
-- select d.id, d.dealership_name, d.owner_id, d.lead_export_frequency,
--        d.lead_export_last_sent_at
-- from dealerships d
-- order by d.created_at;
--
-- The second says what happened on the days it was due. A business with
-- NO ROWS here has never reached the sending step at all; a business
-- with success = false every week has the permanent failure above:
--
-- select l.dealership_id, d.dealership_name, l.created_at, l.success,
--        l.error, l.recipient, l.row_count
-- from lead_export_log l
-- join dealerships d on d.id = l.dealership_id
-- order by l.created_at desc
-- limit 20;
