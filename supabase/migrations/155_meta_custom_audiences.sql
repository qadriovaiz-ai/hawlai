-- Meta Custom Audiences — retargeting piece 5/7.
--
-- VERIFIED against Meta's Marketing API before writing:
--   POST /act_<AD_ACCOUNT_ID>/customaudiences
--   - website audiences carry a `rule` with inclusions/exclusions,
--     each with event_sources [{id: pixelId, type: 'pixel'}], a
--     retention_seconds window, and an event filter. The EXCLUSION is
--     what makes "added to cart but didn't buy" expressible at all —
--     it's a rule Meta evaluates, not something we post-filter.
--   - customer_list audiences need subtype 'CUSTOM' +
--     customer_file_source, with SHA-256 hashed data (already
--     produced by audienceHashing.ts from piece 1).
--   - lookalike audiences need origin_audience_id + lookalike_spec
--     {country, ratio} where ratio is 0.01-0.10.
--   - Custom Audience TERMS OF SERVICE acceptance is mandatory on the
--     ad account; without it creation fails with a distinct
--     "Custom Audience Terms Not Accepted" error rather than working.

create table if not exists meta_custom_audiences (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Our own stable key for the audience's PURPOSE (e.g.
  -- 'abandoned_cart'), so re-syncing updates the same Meta audience
  -- instead of creating a duplicate every time someone clicks sync.
  -- Free text, same convention as agent_tasks.action_type.
  audience_key text not null,
  audience_type text not null check (audience_type in ('website', 'customer_list', 'lookalike')),

  -- Meta's own id — null until the first successful create.
  meta_audience_id text,
  name text not null,

  -- Meta's OWN estimate of audience size. Deliberately not computed
  -- locally: our page_events count and Meta's matched count are
  -- genuinely different numbers (match rates, dedup, their own
  -- minimums), and showing ours labelled as theirs would misrepresent
  -- how many people an ad will actually reach.
  approximate_count integer,

  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  sync_error text,
  last_synced_at timestamptz,

  created_at timestamptz not null default now(),
  -- The guard against the classic failure here: clicking sync twice
  -- creating two identical Meta audiences.
  unique(dealership_id, audience_key)
);

create index if not exists idx_meta_custom_audiences_dealership
  on meta_custom_audiences(dealership_id);

alter table meta_custom_audiences enable row level security;
create policy "meta_custom_audiences_owner_all" on meta_custom_audiences
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
