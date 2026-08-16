-- Migration 118: Business Knowledge — structured facts (hours, pricing
-- notes, policies, FAQ) the AI Communication Employee can draw from
-- instead of relying on free-text custom_call_instructions or
-- inventing details. Deliberately simple/structured, not a vector
-- store — most businesses will have well under 100 rows, and keyword/
-- category filtering is enough at this scale.
--
-- Part of the "AI Communication Employee" Phase 1 foundation (Business
-- Brain architecture) — this is the knowledge-base piece, built first
-- since it's the lowest-risk of the four Phase 1 pieces.

create table if not exists business_knowledge (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  category text not null default 'faq' check (category in ('hours', 'pricing_note', 'policy', 'faq', 'general')),
  title text not null,    -- e.g. "Weekend hours" or "Return policy"
  content text not null,  -- the actual fact, in plain language

  is_active boolean not null default true, -- lets an owner retire a fact without losing history

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_business_knowledge_dealership_id on business_knowledge(dealership_id);

alter table business_knowledge enable row level security;

create policy "business_knowledge_dealership_all" on business_knowledge
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
