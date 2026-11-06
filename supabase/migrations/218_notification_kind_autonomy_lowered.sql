-- 218: the owner is told when the product stops acting on its own.
--
-- S7/P3. The same extend-the-constraint pattern as 109/110/121/122/132/
-- 190, and the list below is 190's with one value added.
--
-- WHY A MIGRATION FOR ONE WORD. `notifications.kind` is CHECK-
-- constrained, `emitNotification` swallows a refused insert by design,
-- and a demotion is the one event in this stage the owner must not miss.
-- Without this the brake would work, write its decision row, and tell
-- him nothing — which is the fault this whole stage is built around.
--
-- IT IS NOT THE ONLY TELLING. The demotion also writes a `decisions`
-- row (kind 'automation_switched', first writer since migration 215
-- declared it) and logs a line, and S7/P3a puts the same sentence in
-- the daily email, which is the surface he actually reads. Three
-- records that fail in different ways, because a limit that lives in
-- one place is a limit that can go quiet.

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
    -- S7/P3: a level was lowered because something went out that the
    -- business's records do not support, or because nothing could be
    -- checked for days. Never gated, never asked about — see
    -- CLAUDE.md rule 6.
    'autonomy_lowered'
  ));
