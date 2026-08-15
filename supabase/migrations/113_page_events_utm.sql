-- ============================================================
-- Multi-touch attribution, Extension 2 — UTM parameter capture.
-- Lets page_events (and, via the visitor-id bridge, lead_touchpoints)
-- distinguish organic/paid-social/direct/email traffic, not just
-- WhatsApp/chat-widget engagement.
-- ============================================================

alter table page_events add column if not exists utm_source text;
alter table page_events add column if not exists utm_medium text;
alter table page_events add column if not exists utm_campaign text;
