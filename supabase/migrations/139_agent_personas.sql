-- Multi-Agent Workforce — P3 piece 5
-- Personas already existed implicitly: four separately-written prompts
-- that happen to behave like a salesperson (outbound calls, website
-- chat), a receptionist (inbound calls), and support (DMs). Nobody
-- chose those mappings. This makes them explicit and hands the choice
-- to the business owner.
--
-- Deliberately CONFIGURATION, not AI-chosen routing: no intent
-- classification decides which persona handles a live customer
-- interaction. Defaults (in code, personas.ts) exactly match today's
-- behavior, so a business that never touches this sees zero change.

create table if not exists agent_persona_settings (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  channel text not null check (channel in ('call_outbound','call_inbound','dm','website_chat')),
  persona text not null check (persona in ('sales','support','receptionist')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(dealership_id, channel)
);

create index if not exists idx_agent_persona_settings_dealership on agent_persona_settings(dealership_id);

alter table agent_persona_settings enable row level security;
create policy "agent_persona_settings_owner_all" on agent_persona_settings
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
