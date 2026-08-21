-- P3 Agency multi-business-switching fix — a person who both owns a
-- business and is staff on a different agency's client team couldn't
-- reach that client team at all: /api/agency/switch blocked anyone
-- who owns a dealership, with no way back to their own business once
-- switched. Owner-to-owned-business switching itself already worked
-- fine (/api/business/switch, dealerships.owner_id isn't unique) —
-- this is specifically about the staff-switcher.

alter table profiles add column if not exists home_dealership_id uuid references dealerships(id) on delete set null;

-- Backfill: any existing owner's home is whichever business they own
-- today (arbitrarily the oldest, if they own several via the already-
-- working multi-business feature).
update profiles p set home_dealership_id = (
  select id from dealerships where owner_id = p.id order by created_at asc limit 1
) where exists (select 1 from dealerships where owner_id = p.id);
