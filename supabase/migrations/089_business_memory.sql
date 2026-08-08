-- Migration 089: Business Memory — durable learnings Master Chat
-- carries across conversations, instead of starting fresh every time.
--
-- A real CMO remembers "Diwali campaigns outperform generic promos
-- 3x" or "this audience responds better to Hinglish" months later.
-- Master Chat previously had no way to do that — every conversation
-- was stateless. This gives it a small, curated set of durable facts
-- about the business that get pulled into context on every turn.

create table if not exists business_memory (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  category text not null default 'general' check (category in ('campaign_performance', 'audience_insight', 'content_preference', 'timing', 'general')),
  insight text not null, -- the actual learning, in plain language
  source text not null default 'chat' check (source in ('chat', 'manual', 'auto_analytics')),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_business_memory_dealership_id on business_memory(dealership_id);

alter table business_memory enable row level security;

create policy "business_memory_dealership_all" on business_memory
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
