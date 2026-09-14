-- ============================================================
-- India festival dates, 14 Sep 2026 → Oct 2027, and the notification
-- kind the out-of-season check emits.
--
-- seasonal_events (108) was deliberately left empty: Indian festival
-- dates move every year and a guessed date is a fabricated fact. These
-- come from two sources and were approved by the platform owner on
-- 2026-09-14 before being loaded:
--   - DoPT holiday lists, O.M. F.No.12/2/2023-JCA dated 03.07.2025
--     (2026) and 16.07.2026 (2027) — gazetted and restricted holidays.
--   - Drik Panchang (New Delhi) for the three DoPT doesn't list:
--     Sharad Navratri day 1, Dhanteras, Akshaya Tritiya.
--
-- Names match FESTIVAL_GUIDE in src/lib/expertise/seasonalCalendar.ts
-- exactly — that's where each festival's angle, other names and grace
-- period live. Holika Dahan is covered by Holi, and Naraka Chaturdasi
-- and Govardhan Puja by the Diwali week; they aren't separate rows.
--
-- Fixed-date moments (New Year, Republic Day, Valentine's Day,
-- Independence Day, Christmas) and Mother's/Father's Day (2nd Sunday of
-- May / 3rd Sunday of June) are worked out in code, not stored here.
--
-- Side effect to know about: a business with seasonal_campaigns_enabled
-- (default off) starts getting planning entries in its Content Calendar
-- as each festival's lead window opens.
-- ============================================================

alter table seasonal_events add column if not exists source text;

insert into seasonal_events (name, event_date, lead_time_days, region, source) values
  -- DoPT 2026 (O.M. dated 03.07.2025)
  ('Ganesh Chaturthi',          '2026-09-14',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (RH)'),
  ('Durga Puja',                '2026-10-18', 21, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (RH, Saptami)'),
  ('Dussehra',                  '2026-10-20', 21, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (G)'),
  ('Karwa Chauth',              '2026-10-29', 10, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (RH)'),
  ('Diwali',                    '2026-11-08', 21, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (G)'),
  ('Bhai Dooj',                 '2026-11-11', 10, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (RH)'),
  ('Chhath Puja',               '2026-11-15',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (RH)'),
  ('Guru Nanak Jayanti',        '2026-11-24',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (G)'),
  -- DoPT 2027 (O.M. dated 16.07.2026)
  ('Makar Sankranti / Pongal',  '2027-01-14',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Basant Panchami',           '2027-02-11',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Maha Shivratri',            '2027-03-06',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Eid al-Fitr',               '2027-03-10', 14, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (G, Id-ul-Fitr)'),
  ('Holi',                      '2027-03-23', 14, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (G)'),
  ('Gudi Padwa / Ugadi',        '2027-04-07',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Baisakhi',                  '2027-04-14',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Ram Navami',                '2027-04-15',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (G)'),
  ('Eid al-Adha',               '2027-05-17',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (G, Id-ul-Zuha)'),
  ('Raksha Bandhan',            '2027-08-17', 14, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Janmashtami',               '2027-08-25',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (G)'),
  ('Ganesh Chaturthi',          '2027-09-04',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Onam',                      '2027-09-12',  7, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH)'),
  ('Durga Puja',                '2027-10-06', 21, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (RH, Saptami)'),
  ('Dussehra',                  '2027-10-09', 21, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (G)'),
  ('Diwali',                    '2027-10-29', 21, 'IN', 'DoPT O.M. F.No.12/2/2023-JCA dated 16.07.2026 (G)'),
  -- Drik Panchang, New Delhi
  ('Sharad Navratri',           '2026-10-11', 21, 'IN', 'Drik Panchang, New Delhi (Ashwina Navaratri day 1)'),
  ('Dhanteras',                 '2026-11-06', 21, 'IN', 'Drik Panchang, New Delhi (Dhantrayodashi)'),
  ('Akshaya Tritiya',           '2027-05-09', 14, 'IN', 'Drik Panchang, New Delhi'),
  ('Sharad Navratri',           '2027-09-30', 21, 'IN', 'Drik Panchang, New Delhi (Ashwina Navaratri day 1)'),
  ('Dhanteras',                 '2027-10-27', 21, 'IN', 'Drik Panchang, New Delhi (Dhantrayodashi)')
on conflict (name, event_date) do nothing;

-- The daily out-of-season check notifies the owner. emitNotification
-- swallows errors, so without this kind every one would silently vanish.
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
    'out_of_season_content'
  ));
