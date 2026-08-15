-- ============================================================
-- AI-Intelligence Pillar 2 — auto-iteration on creative A/B tests.
--
-- Separate, default-off opt-in (deliberately decoupled from
-- auto_pause_low_performers — a dealer may want auto-pause without
-- auto-iteration). When an auto-pause leaves exactly one active
-- member of a variant group standing, a new variant is generated as
-- a DRAFT only (never auto-launched — that would spend real ad
-- money without a human click, which stays out of scope here).
-- ============================================================

alter table dealerships add column if not exists auto_generate_variant_on_pause boolean default false;

-- New notification kind so the dealer sees a fresh draft was prepared
-- for them to review, same pattern as every other autopilot-prep
-- notification.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'variant_draft_generated'
  ));
