-- 209: autonomy levels per business, per action — C6, S3/P0.
--
-- WHAT THIS IS FOR. `executionPolicy.ts` says what kind of action
-- something is and how risky; `approvalAuthority.ts` says who may
-- approve it. Neither says whether this particular business still needs
-- to be asked, and that is a level:
--
--   L0  nothing happens until a human approves that instance. A
--       pending_approvals row every time. The default, and what every
--       action does today.
--   L1  acts on the owner's own chat instruction with no second
--       approval click, BECAUSE IT IS REVERSIBLE — the before-state is
--       stored on the publish action, the audit row is written, and an
--       undo exists.
--
-- L2 — running unattended, nobody instructing it — IS DELIBERATELY NOT
-- EXPRESSIBLE HERE. The CHECK below allows 'L0' and 'L1' only. The
-- founder's position, 22 October 2026: L2 waits for S5's outcome loop,
-- because the rule is "kabhi nuksaan na ho, sirf growth" and that proof
-- only comes from measurement, which does not exist yet. When it does,
-- a later migration widens this CHECK the way 179 and 204 widened
-- publish_actions.platform — one value at a time, as each is actually
-- earned. A code-only guard would be one edit away from gone; a row
-- that cannot be written is not.
--
-- WHY action_key HAS NO CHECK CONSTRAINT. Migration 170's reasoning,
-- reused rather than re-argued: "the policy table is code and moves
-- faster than migrations, and a mismatch is caught by a test rather
-- than by a failed insert at the worst possible moment."
-- tests/autonomyLevels.test.ts is that test.
--
-- WHAT A MISSING ROW MEANS. Ask. Absence is never permission —
-- ACTION_POLICIES' own header already says absence is not "safe by
-- default", and the code resolves every unclear case downward to L0:
-- no row, an unknown action, an action whose platform cannot undo
-- itself, or a stored value this code does not recognise.
--
-- SPEND IS NOT PINNED HERE, AND THAT IS ON PURPOSE. Pinning it in SQL
-- would mean listing action keys in a CHECK, which is exactly the drift
-- 170 refused. It is pinned in `autonomyLevels.ts` by action TYPE, and
-- tests/autonomyLevels.test.ts walks every spend and every critical
-- action in the registry rather than naming the one I thought of.

create table if not exists action_levels (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Maps to a key in ACTION_POLICIES. See the note above on why this is
  -- not constrained.
  action_key text not null,

  level text not null check (level in ('L0', 'L1')),

  -- Who raised it and when, because a level is a permission the owner
  -- granted and an audit row that cannot say who granted it is not an
  -- audit row.
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now(),

  -- The owner's own reason, in their words, shown back to them on the
  -- settings screen. Optional.
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One level per action per business. A second row would make
  -- "which one wins" a question nobody should have to answer.
  unique (dealership_id, action_key)
);

comment on table action_levels is
  'Per-business autonomy level for one action key (C6). L0 = approve every instance; L1 = act on the owner''s chat instruction because the change is reversible and undo-backed. No row means L0. L2 is not expressible until a later migration widens the CHECK — see S5/S7.';

comment on column action_levels.action_key is
  'A key in executionPolicy.ts ACTION_POLICIES. Deliberately unconstrained: that table is code and moves faster than migrations; tests/autonomyLevels.test.ts catches a mismatch.';

comment on column action_levels.level is
  'L0 | L1. L0 is the default for any action with no row. Spend, delete and critical-risk actions are pinned to L0 in autonomyLevels.ts whatever this says.';

create index if not exists idx_action_levels_dealership
  on action_levels(dealership_id);

alter table action_levels enable row level security;

drop policy if exists "action_levels_dealership_all" on action_levels;
create policy "action_levels_dealership_all" on action_levels
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

drop trigger if exists on_action_levels_update on action_levels;
create trigger on_action_levels_update
  before update on action_levels
  for each row execute procedure public.set_ecommerce_updated_at();
