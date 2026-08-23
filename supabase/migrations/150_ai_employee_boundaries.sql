-- AI employee boundaries — UX Transformation, piece 5b.
--
-- VERIFIED before writing: dealerships.custom_call_instructions is
-- free text, and callScriptAgent.ts renders it as "follow these, but
-- never contradict the safety rules below" — i.e. subordinate advice.
-- A prohibition typed there is a suggestion, not a constraint. Hence
-- its own structure.
--
-- A TABLE, not a column: the prompt renders each rule as a discrete
-- numbered constraint. A single text blob would either be dumped
-- verbatim (unenforceable) or need free-text parsing into rules
-- (fragile). Individual rows also let an owner retire one rule
-- without retyping the rest.
--
-- HONEST SCOPE: these are rendered as explicit prompt rules — strong
-- instructions, NOT a hard technical guarantee. The real hard
-- guarantees in this system stay the persona tool allowlist (a sales
-- persona literally cannot call request_refund) and the approval
-- gates. The UI says so rather than letting an owner believe a typed
-- sentence is an enforced control.

create table if not exists ai_employee_boundaries (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  -- The rule in the owner's own words, e.g. "Never promise a discount
  -- that isn't already published."
  rule text not null,
  -- Lets an owner retire a rule without losing the record of it, same
  -- convention as business_knowledge.is_active.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_employee_boundaries_dealership
  on ai_employee_boundaries(dealership_id) where is_active;

alter table ai_employee_boundaries enable row level security;

-- Owner-managed configuration about their own business, written from
-- the settings UI — same `for all` reasoning as agent_persona_settings
-- and onboarding_sessions.
create policy "ai_employee_boundaries_owner_all" on ai_employee_boundaries
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
