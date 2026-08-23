-- Intent capture & product mode — UX Transformation, piece 4.
--
-- VERIFIED before writing: onboarding_completed (migration 023) is a
-- single boolean with no step/state tracking, and WelcomeChatCard asks
-- WHO the business is (brand voice) but never WHAT they want. No
-- intent, mode, or activation concept existed anywhere in the schema —
-- this is genuinely new, not a duplicate of something already there.

-- The customer's primary reason for being here. NULL = full product,
-- which is what every EXISTING business stays on. Confirmed decision:
-- no forced re-onboarding for working accounts; only new signups go
-- through intent capture, and existing owners get an optional
-- switcher if they want to try a focused experience.
alter table dealerships add column if not exists product_mode text
  check (product_mode is null or product_mode in
    ('calling','marketing','automation','research','website','full'));

-- What the customer actually typed, verbatim. Stored separately from
-- the resolved mode because it's the honest record of what they asked
-- for — useful for improving routing later, and it survives even when
-- the router guessed wrong.
alter table dealerships add column if not exists onboarding_intent_text text;

-- Onboarding is no longer one boolean: a focused journey has real
-- steps that can be resumed. One row per business per onboarding run.
create table if not exists onboarding_sessions (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  product_mode text not null,
  -- Free text, same convention as agent_tasks.action_type: adding a
  -- step to a journey shouldn't need a migration.
  current_step text not null default 'intent',
  completed_steps jsonb not null default '[]'::jsonb,
  -- The "first value moment": onboarding isn't complete because forms
  -- were filled, it's complete when the customer saw something real
  -- happen (a test call connected, a first report generated).
  activation_event text,
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onboarding_sessions_dealership
  on onboarding_sessions(dealership_id, created_at desc);

alter table onboarding_sessions enable row level security;

-- `for all`, not select-only — deliberately different from the billing
-- tables. This is the customer's own progress through their own setup,
-- written from the browser as they move between steps. There's no
-- integrity reason to force it through the service-role client, and
-- doing so would add a pointless API hop.
create policy "onboarding_sessions_owner_all" on onboarding_sessions
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
