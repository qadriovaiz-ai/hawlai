-- ============================================================
-- Leads for any kind of business: what the lead wants (interest) and
-- everything else they told us (details), instead of vehicle and
-- purchase year.
--
-- Approved 2026-09-17 (industry-agnostic overhaul, Phase 1).
--
-- leads.vehicle and leads.purchase_year are kept (not dropped) so nothing
-- that still reads them breaks and no data is lost; the app stops writing
-- them. Existing values are copied: vehicle → interest, purchase_year →
-- details.purchase_year.
--
-- Pipeline stage VALUES are unchanged — each business sees its own names
-- for them (lib/leads/leadProfile.ts).
-- ============================================================

alter table leads add column if not exists interest text;
alter table leads add column if not exists details jsonb not null default '{}'::jsonb;

update leads
set interest = vehicle
where interest is null and vehicle is not null and btrim(vehicle) <> '';

update leads
set details = details || jsonb_build_object('purchase_year', purchase_year)
where purchase_year is not null and not (details ? 'purchase_year');
