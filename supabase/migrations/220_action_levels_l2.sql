-- 220: the database learns L2, and refuses it for everything unproven.
--
-- S7/P4, on the founder's decision of 5 November 2026: *"Database L2
-- seekhe — haan, allowlist constraint ke saath (jo sirf proven-safe
-- actions ko L2 allow kare, baaki sab ke liye L2 likhna hi mana ho)."*
--
--   L0  nothing happens until a human approves that instance
--   L1  acts on the owner's own chat instruction, because it is
--       reversible and undo-backed
--   L2  RUNS UNATTENDED. Nobody instructed it. The growth manager finds
--       something in the morning run and does it, and the owner reads
--       about it afterwards.
--
-- MIGRATION 209 PREDICTED THIS MIGRATION, in those words: "a later
-- migration widens this CHECK the way 179 and 204 widened
-- publish_actions.platform — one value at a time, as each is actually
-- earned. A code-only guard would be one edit away from gone; a row
-- that cannot be written is not."
--
-- SO THERE ARE TWO CONSTRAINTS, NOT ONE. Widening the level check alone
-- would let any action key hold L2 the moment the code allowed it. The
-- second constraint names the keys that may, and nothing else can be
-- written at L2 at all — not by a bug, not by a migration that forgets,
-- not by a well-meaning admin script.
--
-- WHY THAT DOES NOT CONTRADICT 209's "action_key HAS NO CHECK
-- CONSTRAINT". 209 refused to enumerate every action key, because the
-- policy table is code and moves faster than migrations — and that
-- still holds: L0 and L1 remain open to any key. What is enumerated
-- here is only the far smaller set ALLOWED TO RUN WITH NOBODY
-- WATCHING. That is a safety boundary, not a catalogue, and it is meant
-- to move slowly.
--
-- ONE KEY TODAY: update_page_meta — the search title and description of
-- a page of the business's own site. The founder's decision 3. It is
-- reversible, hawlaiSite implements undo() for it, nothing spends,
-- nothing reaches a customer's inbox, and it is the action he has
-- approved most often since migration 203 shipped on 29 September.
--
-- tests/autonomyLevels.test.ts pins this list against
-- src/lib/autonomy/policy.ts's L2_ALLOWLIST, so the two cannot drift
-- apart — a key in the code and not here would fail every insert at the
-- worst possible moment.

alter table action_levels drop constraint if exists action_levels_level_check;
alter table action_levels
  add constraint action_levels_level_check
  check (level in ('L0', 'L1', 'L2'));

-- THE ALLOWLIST. Everything not named here is refused at L2 by the
-- database itself, whatever the code believes.
alter table action_levels drop constraint if exists action_levels_l2_allowlist;
alter table action_levels
  add constraint action_levels_l2_allowlist
  check (
    level <> 'L2'
    or action_key in ('update_page_meta')
  );

comment on column action_levels.level is
  'L0 | L1 | L2. L0 is the default for any action with no row. L1 acts on the owner''s own instruction because the change is reversible and undo-backed. L2 runs unattended — and is refused by action_levels_l2_allowlist for every action key not explicitly earned, as well as by autonomyLevels.ts for anything that spends, deletes, cannot be undone, or carries critical risk.';

comment on constraint action_levels_l2_allowlist on action_levels is
  'Only the action keys named here may ever be written at L2. A safety boundary rather than a catalogue: L0 and L1 stay open to any key, as migration 209 intended. Widened one value at a time, as each is actually earned — the same discipline publish_actions.platform follows.';
