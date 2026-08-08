-- Migration 088: Real email open/click tracking via Resend webhooks.
--
-- Every email sent through sendDealerEmail (whichever path — Gmail or
-- Resend) gets logged here. Only the Resend path can be enriched with
-- real open/click data (Resend fires webhooks for its own sends);
-- Gmail-sent emails are logged for volume but stay untracked — this
-- is a real platform limitation, not a bug, and the UI says so rather
-- than pretending open rates for that half of sends.

create table if not exists email_sends (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  to_email text not null,
  subject text not null,
  via text not null check (via in ('gmail', 'resend')),
  resend_message_id text, -- null for gmail sends — nothing to correlate a webhook against

  opened boolean default false,
  open_count integer default 0,
  clicked boolean default false,
  click_count integer default 0,
  last_event_at timestamptz,

  created_at timestamptz default now()
);

create index if not exists idx_email_sends_dealership_id on email_sends(dealership_id);
create index if not exists idx_email_sends_resend_message_id on email_sends(resend_message_id);

alter table email_sends enable row level security;

create policy "email_sends_dealership_all" on email_sends
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
