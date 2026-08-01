-- WhatsApp control — lets the Owner (and later, team members) run
-- Master Chat itself from their own WhatsApp, not just receive
-- content. Security-critical: a phone number must be explicitly
-- verified (OTP) before it can control anything — no unverified
-- number can ever act on a business account, regardless of what it
-- claims to be.
alter table dealerships add column if not exists owner_whatsapp_number text;
alter table dealerships add column if not exists owner_whatsapp_verified boolean default false;

alter table team_members add column if not exists whatsapp_number text;
alter table team_members add column if not exists whatsapp_verified boolean default false;

-- Short-lived OTP codes for the verification step. Not reused as a
-- long-term store — each row is consumed/expired quickly, kept
-- separate from the dealerships/team_members tables so verification
-- state churn doesn't touch those.
create table if not exists whatsapp_verification_codes (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  team_member_id uuid references team_members(id) on delete cascade, -- null = this is the Owner's own number
  phone_number text not null,
  code text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_whatsapp_verification_phone on whatsapp_verification_codes(phone_number);

alter table whatsapp_verification_codes enable row level security;
drop policy if exists "whatsapp_verification_codes_dealership_all" on whatsapp_verification_codes;
create policy "whatsapp_verification_codes_dealership_all" on whatsapp_verification_codes
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- Conversation state for WhatsApp — Master Chat needs the same
-- rolling history it has on the web, keyed by phone number instead of
-- a browser session. No separate "pending confirmation" field —
-- Master Chat already handles "yes, go ahead" replies correctly
-- through ordinary conversation history, the same way it does on the
-- web chat.
create table if not exists whatsapp_chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  phone_number text not null unique,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_whatsapp_chat_sessions_phone on whatsapp_chat_sessions(phone_number);

alter table whatsapp_chat_sessions enable row level security;
drop policy if exists "whatsapp_chat_sessions_dealership_all" on whatsapp_chat_sessions;
create policy "whatsapp_chat_sessions_dealership_all" on whatsapp_chat_sessions
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
