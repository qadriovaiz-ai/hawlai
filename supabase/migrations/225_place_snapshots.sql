-- ============================================================
-- What Google Maps says this business is called, and where
-- ============================================================
-- The Maps leg of G5 / local plan L2 — the check the plan called the
-- headline one and the one piece of it that costs money.
--
-- WHY A SNAPSHOT TABLE AND NOT A LIVE READ. The comparison itself is
-- free: it is three strings against three strings. The FETCH is a
-- Place Details call to Google, which is a third-party network request —
-- and by cronGroups.ts's own rule that cannot live in the `signals`
-- group, where the daily local audit runs, because signals is
-- "database-only and fast" and runs in front of the emails.
--
-- So the fetch is monthly, in `heavy`, and writes one row here. The
-- daily comparison reads the row. Exactly the shape search_console_sync
-- already uses: the slow half writes, the fast half reads.
--
-- ONE ROW PER BUSINESS, so dealership_id IS the primary key. The
-- snapshot is a current state, not a history: a second row would mean a
-- second answer to "what does Maps say", and the comparison would have
-- to pick. If a history is ever wanted it belongs in its own table with
-- its own retention answer, which this does not have.
--
-- WHAT IT COSTS. The field mask is displayName, formattedAddress and
-- nationalPhoneNumber. The phone is what puts the request on the Place
-- Details ENTERPRISE SKU — the founder's decision of 8 November 2026,
-- taken knowingly: Enterprise is free for the first 1,000 requests a
-- month and $20 per 1,000 after that, so at one request per business per
-- month it costs nothing until a thousand businesses. Billing is at the
-- highest SKU in the request, so adding the phone prices the whole call.
--
-- NO geo COLUMN, NO rating, NO reviews. Only the three fields the
-- comparison reads. Places bills by the fields requested, and a column
-- nothing compares is a column somebody later fills by widening the
-- mask.
--
-- RUN BY HAND, as every migration here is.

create table if not exists place_snapshots (
  dealership_id uuid primary key references dealerships(id) on delete cascade,
  -- The listing this snapshot is OF, stored beside the values: if the
  -- owner reconnects to a different listing, a stale snapshot must be
  -- recognisable as belonging to the old one rather than silently
  -- compared against the new.
  place_id text not null,
  place_name text,
  place_address text,
  place_phone text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table place_snapshots is
  'What Google Maps returns for this business''s listing: name, address and phone, fetched monthly by the place_snapshot subsystem. One row per business — a current state, not a history. Compared daily against dealerships.dealership_name, dealerships.business_address and business_listing_facts.public_phone by lib/seo/localPresence.ts. The phone field puts the fetch on the Place Details Enterprise SKU (approved 8 Nov 2026).';

comment on column place_snapshots.place_id is
  'The listing these values came from. Stored so a snapshot of a PREVIOUS listing is not compared against the current one after the owner reconnects.';

alter table place_snapshots enable row level security;

drop policy if exists "place_snapshots_owner_select" on place_snapshots;
create policy "place_snapshots_owner_select" on place_snapshots
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

drop policy if exists "place_snapshots_member_select" on place_snapshots;
create policy "place_snapshots_member_select" on place_snapshots
  for select using (
    dealership_id in (
      select dealership_id from team_members where user_id = auth.uid() and status = 'active'
    )
  );

-- NO INSERT, UPDATE OR DELETE POLICY, deliberately. These values are
-- Google's answer, not the owner's, and a client that could write them
-- could make the site and the listing "agree" without either changing.
-- The monthly subsystem writes through the service role.

-- ---- verify -----------------------------------------------------
--
--   select relname, relrowsecurity
--   from pg_class where relname = 'place_snapshots';
--
-- Expected: one row, relrowsecurity = t.
--
--   select polname, cmd from pg_policies
--   where tablename = 'place_snapshots' order by polname;
--
-- Expected: EXACTLY TWO rows, both SELECT —
-- place_snapshots_member_select and place_snapshots_owner_select.
-- Anything with cmd = INSERT/UPDATE/DELETE here is a bug: nothing but
-- the service role may write Google's answer.
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'place_snapshots' order by ordinal_position;
--
-- Expected, in order: dealership_id uuid NO · place_id text NO ·
-- place_name text YES · place_address text YES · place_phone text YES ·
-- fetched_at timestamptz NO · created_at timestamptz NO.
--
--   select count(*) from place_snapshots;
--
-- Expected: 0. Nothing is fetched until the 1st of a month, and only
-- for a business that has connected a Google listing.
