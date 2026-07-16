-- CRM Marketing — Meeting Booking + fixing a leftover car-dealership-
-- only constraint on appointments (same category of bug as the
-- "car model" placeholder text fixed earlier: appointment_type was
-- hardcoded to 'test_ride'/'showroom_visit' from the AutoPilot AI
-- era, breaking for any non-automotive business).

alter table appointments drop constraint if exists appointments_appointment_type_check;
alter table appointments alter column appointment_type set default 'meeting';
-- Intentionally no check constraint — appointment types vary too much
-- across business categories (site visit, consultation, call, test
-- ride, showroom visit...) to hardcode a fixed list.

alter table dealerships add column if not exists booking_slug text unique;
