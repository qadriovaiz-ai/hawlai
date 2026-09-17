-- ============================================================
-- How a business makes money — products, services, subscriptions, B2B
-- (any combination). The structured signal departments branch on;
-- business_category stays free text for prompts.
--
-- Approved 2026-09-17 (industry-agnostic overhaul, Phase 0).
--
-- Also: business_category defaulted to 'car dealership' (migration 018),
-- so any business that skipped onboarding was silently a car dealership.
-- The default is dropped; existing values are left alone — a business
-- that really is a car dealership keeps its category, and anyone else
-- can change theirs in Settings.
-- ============================================================

alter table dealerships add column if not exists business_models text[] not null default '{}';
alter table dealerships drop constraint if exists dealerships_business_models_check;
alter table dealerships add constraint dealerships_business_models_check
  check (business_models <@ array['products', 'services', 'subscription', 'b2b']::text[]);

-- A business with products in its catalogue sells products. Owners
-- confirm or change this in Settings → Brand Voice.
update dealerships d
set business_models = array['products']
where business_models = '{}'
  and exists (select 1 from products p where p.dealership_id = d.id and p.is_active = true);

alter table dealerships alter column business_category drop default;
