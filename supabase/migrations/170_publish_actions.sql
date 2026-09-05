-- Publish actions — the shared generate → preview → approve → execute
-- spine for every platform that Hawlai writes to.
--
-- FOR REVIEW. Not yet run.
--
-- WHY THIS EXISTS AT ALL. Shopify write support and WordPress publish
-- support are the same problem wearing two API clients: propose a
-- change, show a human exactly what it will do, get a decision, then
-- execute it somewhere platform-specific. Building them as two
-- features would produce two approval gates, and the next person would
-- not know which one governs — the failure mode this codebase has
-- already been bitten by with timing-safe comparison.
--
-- WHAT THIS TABLE IS NOT. It is not a second approval system. The
-- policy layer (src/lib/executionPolicy.ts) and the approval inbox
-- (pending_approvals, migration 006) already exist, are already
-- tested, and already encode "ads are created paused and activated
-- separately". This table records the LIFECYCLE of a publish, and
-- delegates the DECISION to pending_approvals via approval_id.
--
-- Those are genuinely different things, and conflating them is what
-- makes "approved but never actually ran" invisible: pending_approvals
-- has three states (pending/approved/rejected) because it records a
-- verdict. A publish has to record a verdict AND an outcome.

create table if not exists publish_actions (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Which platform executes this, and which connected account/site.
  -- connection_ref is deliberately loose text rather than a foreign
  -- key: a business may have a Shopify store AND a WordPress site, and
  -- those live in different columns on dealerships today. Pinning this
  -- to one table would force a schema decision that platform support
  -- has not earned yet.
  platform text not null check (platform in ('shopify', 'wordpress', 'woocommerce')),
  connection_ref text,

  -- Maps to a key in ACTION_POLICIES. Not a check constraint: the
  -- policy table is code and moves faster than migrations, and a
  -- mismatch is caught by a test rather than by a failed insert at
  -- the worst possible moment.
  action_key text not null,

  -- The thing being changed, in both machine and human form. Both are
  -- stored because target_ref alone makes an audit row unreadable six
  -- months later ("we changed gid://shopify/Product/12345 to what?"),
  -- and target_label alone cannot be acted on.
  target_ref text,
  target_label text,

  -- The intent: what the requester wants to become true.
  requested_changes jsonb not null default '{}'::jsonb,

  -- What the human was shown, INCLUDING the before-state. This is not
  -- a display cache — it is the baseline execution re-verifies
  -- against.
  --
  -- THE STALE PREVIEW HAZARD, which drives this whole design: someone
  -- previews a price at 10am, approves at 3pm, and the price changed
  -- in Shopify at noon. Executing the approved intent blindly
  -- overwrites a change nobody saw. So execute() re-reads current
  -- state and compares it to preview.before; if it moved, the action
  -- goes to 'stale' and is re-previewed rather than applied.
  preview jsonb,
  previewed_at timestamptz,

  -- Richer than pending_approvals.status ON PURPOSE. That column
  -- records a decision; this records a lifecycle. 'approved' and
  -- 'executed' are different facts, and a system that cannot tell them
  -- apart cannot answer "what did we approve that never happened?"
  status text not null default 'draft' check (status in (
    'draft',             -- created, nothing shown to anyone yet
    'previewed',         -- diff computed and displayed
    'awaiting_approval', -- a pending_approvals row exists and is open
    'approved',          -- human said yes; NOT yet executed
    'executing',         -- claimed by an executor
    'executed',          -- the platform accepted it
    'failed',            -- the platform refused it, or we errored
    'rejected',          -- human said no
    'stale'              -- the world moved between preview and execute
  )),

  -- The decision lives in the existing inbox, not here. Null when the
  -- policy does not require approval for this action_key.
  approval_id uuid references pending_approvals(id) on delete set null,

  -- Execution must be safe to retry. A network timeout on a price
  -- change must never be able to apply it twice, and "did it work?"
  -- is not answerable from the caller's side after a timeout.
  idempotency_key text not null,

  executed_at timestamptz,
  platform_response jsonb,
  error text,

  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One in-flight action per idempotency key per business. Scoped to the
-- dealership rather than global so two businesses cannot collide.
create unique index if not exists idx_publish_actions_idempotency
  on publish_actions(dealership_id, idempotency_key);

create index if not exists idx_publish_actions_dealership on publish_actions(dealership_id, status);
create index if not exists idx_publish_actions_approval on publish_actions(approval_id) where approval_id is not null;

-- Executors poll for work; this keeps that scan off the full table.
create index if not exists idx_publish_actions_pending
  on publish_actions(status, created_at) where status in ('approved', 'executing');

comment on table publish_actions is
  'Lifecycle of a write to an external platform: draft → previewed → awaiting_approval → approved → executing → executed. The DECISION lives in pending_approvals via approval_id; this records what was proposed, what the human was shown, and what actually happened. Never a second approval system.';

comment on column publish_actions.preview is
  'The diff shown to the human, including the before-state. Re-verified at execution time — if the platform has moved since, the action goes stale rather than overwriting an unseen change.';

comment on column publish_actions.idempotency_key is
  'Retry safety. A timeout on a price change must never apply it twice, and the caller cannot tell from its own side whether the write landed.';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Same owner-scoped shape as every other table here. Deliberately NOT
-- extended to team roles in this migration: who may PROPOSE and who
-- may APPROVE a price change is a real policy question, and answering
-- it silently inside a schema migration would be the wrong place.

alter table publish_actions enable row level security;

drop policy if exists "publish_actions_dealership_all" on publish_actions;
create policy "publish_actions_dealership_all" on publish_actions
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

drop trigger if exists on_publish_actions_update on publish_actions;
create trigger on_publish_actions_update
  before update on publish_actions
  for each row execute procedure public.set_ecommerce_updated_at();

insert into schema_migrations (version, filename)
values ('170', '170_publish_actions.sql')
on conflict (version) do nothing;
