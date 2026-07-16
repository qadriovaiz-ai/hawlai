-- Real auto-reply (not "reply assist") — when enabled, incoming
-- Facebook/Instagram DMs and comments get an AI reply generated AND
-- sent automatically via the Graph API, no human in the loop. Off by
-- default for both channels — turning it on IS the dealer's approval,
-- consistent with the approval-first principle used elsewhere for
-- anything that acts on the dealer's behalf without a review step.

alter table dealerships add column if not exists dm_auto_reply_enabled boolean default false;
alter table dealerships add column if not exists comment_auto_reply_enabled boolean default false;

create table if not exists auto_reply_log (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  channel text not null, -- 'dm' | 'comment'
  source_id text, -- sender PSID for DMs, comment_id for comments
  incoming_text text,
  reply_text text,
  success boolean not null default true,
  error text,
  created_at timestamptz default now()
);

create index if not exists idx_auto_reply_log_dealership_id on auto_reply_log(dealership_id);
create index if not exists idx_auto_reply_log_created_at on auto_reply_log(created_at desc);

alter table auto_reply_log enable row level security;

create policy "auto_reply_log_dealership_select" on auto_reply_log
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
