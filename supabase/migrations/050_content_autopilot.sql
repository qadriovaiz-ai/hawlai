-- Content Autopilot — genuinely automatic social posting. AI
-- generates an on-brand image + caption and posts it directly to
-- Facebook on a schedule the dealer sets, with zero manual copy-
-- paste. Off by default; turning it on is the dealer's approval for
-- everything it posts from then on, same pattern as the other
-- auto-send features. Money-spending actions (ads/budget) are
-- deliberately NOT part of this — those stay manual-launch-only.

alter table dealerships add column if not exists content_autopilot_enabled boolean default false;
alter table dealerships add column if not exists content_autopilot_frequency_days integer default 3; -- post roughly every N days
alter table dealerships add column if not exists content_autopilot_last_posted_at timestamptz;

create table if not exists content_autopilot_log (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  caption text,
  image_url text,
  post_id text, -- Facebook post id, if successful
  success boolean not null default true,
  error text,
  created_at timestamptz default now()
);

create index if not exists idx_content_autopilot_log_dealership_id on content_autopilot_log(dealership_id);

alter table content_autopilot_log enable row level security;

drop policy if exists "content_autopilot_log_dealership_select" on content_autopilot_log;
create policy "content_autopilot_log_dealership_select" on content_autopilot_log
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
