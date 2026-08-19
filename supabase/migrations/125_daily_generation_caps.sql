-- Migration 125: daily generation caps for video and voiceover — P0
-- 14c. Monthly caps already exist and work (migration 100); this adds
-- a second, tighter check specifically for the two priciest-per-unit
-- resources ($3.20/video at 8s, $0.10/1k voiceover chars) — a burst
-- that burns an entire month's allowance in one sitting is a real
-- one-day cost spike even while staying within the monthly cap.
-- Image/brand_kit/website_build aren't included — naturally low-
-- frequency, monthly-only stays sufficient for those.

create table if not exists daily_generation_usage (
  dealership_id uuid not null references dealerships(id) on delete cascade,
  resource text not null check (resource in ('video', 'voiceover_chars')),
  usage_date date not null default current_date,
  count numeric not null default 0,
  primary key (dealership_id, resource, usage_date)
);

alter table plan_limits add column if not exists videos_per_day integer;
alter table plan_limits add column if not exists voiceover_chars_per_day integer;

update plan_limits set videos_per_day = case plan
  when 'free' then 0
  when 'basic' then 1
  when 'pro' then 2
  when 'agency' then 5
end;

update plan_limits set voiceover_chars_per_day = case plan
  when 'free' then 2000
  when 'basic' then 5000
  when 'pro' then 15000
  when 'agency' then 25000
end;
