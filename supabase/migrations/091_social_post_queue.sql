-- Migration 091: Approved Content Queue — lets a business approve a
-- batch of specific posts (e.g. "here's my week") and have autopilot
-- post exactly those, on schedule, instead of always generating fresh
-- content each cycle. Layers on top of the existing content autopilot
-- without changing its behavior for anyone who doesn't use a queue.

create table if not exists social_post_queue (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  scheduled_for date not null,
  caption text not null,
  image_url text not null,

  status text not null default 'queued' check (status in ('queued', 'posted', 'failed', 'skipped')),
  facebook_post_id text,
  instagram_post_id text,
  error text,

  created_at timestamptz default now(),
  posted_at timestamptz
);

create index if not exists idx_social_post_queue_dealership_id on social_post_queue(dealership_id);
create index if not exists idx_social_post_queue_due on social_post_queue(dealership_id, scheduled_for, status);

alter table social_post_queue enable row level security;

create policy "social_post_queue_dealership_all" on social_post_queue
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
