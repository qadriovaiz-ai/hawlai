-- Migration applied-state tracking. Audit item R4.
--
-- WHY THIS EXISTS, concretely. Migration 160 was reported as run and
-- had not been. Nothing in the system could tell, and the R1 code that
-- depended on its columns was already on main — the moment the domain
-- came back, checkout would have failed with a column-does-not-exist
-- error and no way to diagnose which migration was missing. It was
-- only caught by probing the database by hand.
--
-- APPROACH: a ledger written by the migrations themselves, rather than
-- adopting the Supabase CLI.
--
--   The CLI is the more standard answer and manages this table for
--   you. It was NOT chosen because it replaces the workflow rather
--   than supporting it: `supabase db push` assumes the CLI applies
--   migrations, where here they are pasted into the SQL Editor by
--   hand, deliberately, so that no tooling holds production
--   credentials. Adopting it would mean linking the project, running
--   Docker locally, and changing how every future migration is
--   applied — a large change to fix a recording problem.
--
--   The ledger fits the existing discipline: the INSERT is part of the
--   SQL you already paste, so recording cannot drift from applying
--   unless someone pastes half a file.
--
-- WHAT THIS CANNOT DO, stated plainly: it cannot retroactively
-- discover whether migrations 001-162 were applied. That information
-- was never recorded and is not recoverable from the database without
-- probing for each migration's objects individually. Those are marked
-- as a baseline below — an explicit "unknown", not a claim they ran.
-- Tracking is genuine from 163 onward.
--
-- RLS: this is a CREATE TABLE, so policies ship here. This is platform
-- metadata, not tenant data — no role other than service_role has any
-- business reading or writing it. RLS is enabled with NO policies,
-- which denies every role RLS applies to; service_role bypasses RLS
-- and retains full access. Grants are revoked as well, because
-- TRUNCATE is not subject to RLS (the lesson from migration 161) and
-- would otherwise remain reachable.

create table if not exists schema_migrations (
  -- The numeric prefix of the filename, e.g. "163".
  version text primary key,
  filename text not null,
  applied_at timestamptz not null default now(),
  -- SHA-256 of the file's contents at apply time. Lets the checker
  -- detect a migration that was edited AFTER being applied — drift in
  -- the direction a "did it run" check alone would miss.
  checksum text,
  -- false for the pre-tracking baseline row. A false here means "no
  -- evidence either way", never "confirmed applied".
  verified boolean not null default true,
  note text
);

alter table schema_migrations enable row level security;

-- Intentionally no policies. See the RLS note above.

revoke all privileges on table schema_migrations from anon;
revoke all privileges on table schema_migrations from authenticated;
revoke all privileges on table schema_migrations from public;

-- The baseline. One row, not 162 fabricated ones: inserting a row per
-- pre-tracking migration would look like a record of them having run,
-- which is exactly the false confidence this table exists to remove.
insert into schema_migrations (version, filename, verified, note)
values (
  '000_baseline',
  'baseline through 162',
  false,
  'Migrations 001-162 predate this ledger. Their applied state was never recorded and is not recoverable from the database. This row marks the tracking boundary; it is NOT evidence those migrations ran. Known-applied by direct probe on 2026-09-02: 158, 159, 160, 161.'
)
on conflict (version) do nothing;

-- Record this migration itself.
insert into schema_migrations (version, filename, verified)
values ('163', '163_schema_migrations_tracking.sql', true)
on conflict (version) do nothing;

-- ================================================================
-- FOR EVERY MIGRATION FROM 164 ONWARD
-- ================================================================
-- End the file with its own ledger row, so applying and recording are
-- the same paste:
--
--   insert into schema_migrations (version, filename)
--   values ('164', '164_whatever_it_is.sql')
--   on conflict (version) do nothing;
--
-- Then `npm run migrations:check` reports drift between the files on
-- disk and what the database says was applied.
