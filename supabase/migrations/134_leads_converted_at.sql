-- P1 7a (part 2) — leads had no timestamp for "when did this convert",
-- only created_at. Needed so the lead_converted workflow trigger can
-- compute delay_days correctly instead of every step landing as
-- immediately due.
alter table leads add column if not exists converted_at timestamptz;
