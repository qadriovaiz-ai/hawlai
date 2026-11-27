-- 240: two notification kinds for Instagram/Facebook DMs.
--
--   dm_needs_reply      F2 of docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 Nov
--                       2026. A DM Hawlai could not answer — the claims
--                       guard withheld the reply, the AI was down, the
--                       records were unreadable — used to be silent on
--                       both sides. The customer now gets an honest
--                       holding line; this is the seller being told.
--   dm_order_received   Seller Mode (O-pieces): an order taken in a DM.
--                       Added now so Seller Mode needs one fewer
--                       migration; nothing emits it yet.
--
-- THE WHOLE LIST IS REWRITTEN, as every kind migration here does (235 is
-- the one before this). A list that omits a kind production already uses
-- would make those inserts fail.
--
-- ---- BEFORE RUNNING: check the LIVE constraint, not this repo ---------
--
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.notifications'::regclass
--     and conname = 'notifications_kind_check';
--
-- Expected: exactly the 24 kinds below without the two new ones. If it
-- lists ANY kind this file does not, STOP — paste it, and the list here
-- is corrected first.
--
-- RUN BY HAND, as every migration here is.

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
    'autonomy_lowered',
    'integration_disconnected',
    'campaign_not_delivering',
    'scheduled_export_failed',
    'dm_needs_reply',
    'dm_order_received'
  ));

-- ---- VERIFY, after running ------------------------------------------
--
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.notifications'::regclass
--     and conname = 'notifications_kind_check';
--
-- Expected: the 24 kinds above plus 'dm_needs_reply' and
-- 'dm_order_received' — 26 in all.
