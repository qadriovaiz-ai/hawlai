-- Canva Connect integration — Design & Edit, step 2/7.
--
-- VERIFIED against Canva's live API and docs before writing:
--   - The editor CANNOT be iframed. canva.com responds with
--     `X-Frame-Options: SAMEORIGIN`, so a browser refuses to render it
--     inside Hawlai regardless of any partnership tier. The supported
--     flow is: create a design -> open its `edit_url` in a NEW TAB ->
--     user edits in Canva -> clicks Canva's Return button -> lands back
--     here with a `correlation_jwt` we validate against Canva's public
--     keys. Hence `canva_design_id` is stored but no embed state is.
--   - There is NO export webhook. Canva's webhooks cover comments,
--     suggestions and folder access only. Exports are poll-only:
--     create a job, then poll /v1/exports/{id} until success/failed.
--     That's why `status` carries an 'exporting' value — a row sits
--     there between the two calls.
--   - Export download URLs EXPIRE AFTER 24 HOURS. This is the reason
--     exported_asset_url holds a Supabase Storage path and never a
--     canva.com URL: storing theirs would leave the asset library full
--     of links that worked in testing and are dead a day later.
--   - OAuth is Authorization Code + PKCE (SHA-256). The code_verifier
--     and state live in httpOnly cookies between start and callback,
--     which is why neither needs a table here.
--
-- These are the first user-scoped tables in the schema — everything
-- else is dealership-scoped. That's deliberate: a Canva connection is
-- one person's own account and cannot be shared. See the note on
-- canva_designs below, which is the same choice for a less obvious
-- reason.

create table if not exists canva_connections (
  id uuid primary key default uuid_generate_v4(),
  -- unique: one Canva account per Hawlai user. Reconnecting updates
  -- the row rather than accumulating stale token pairs, and a stale
  -- refresh token left readable is exactly what we don't want.
  user_id uuid not null unique references auth.users(id) on delete cascade,

  -- AES-256-GCM, encrypted in the app layer (not pgcrypto) so the key
  -- lives in the environment rather than the database — a dump of this
  -- table alone doesn't yield usable tokens. Each value is a single
  -- string packing iv, auth tag and ciphertext together; GCM needs all
  -- three to decrypt, and the auth tag is what makes tampering fail
  -- loudly instead of silently returning garbage.
  --
  -- NOTE, deliberately recorded: the seven existing OAuth providers
  -- (LinkedIn, Gmail, Google Ads, Pinterest, Snapchat, YouTube) still
  -- store their tokens in PLAINTEXT columns. Canva is encrypted here
  -- because it's new; retrofitting the rest is a separate piece of
  -- work that has not been done. This comment exists so nobody reads
  -- these column names and assumes the whole app is covered.
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,

  -- Access token expiry. Canva's are short-lived, so the refresh path
  -- reads this rather than waiting for a 401.
  expires_at timestamptz not null,

  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Set by the app on refresh. No trigger: this schema has no
  -- updated_at triggers anywhere, and adding one only here would be a
  -- surprise for the next person editing it.
  updated_at timestamptz not null default now()
);

create table if not exists canva_designs (
  id uuid primary key default uuid_generate_v4(),
  -- Scoped to the user, not the dealership, matching the approved
  -- spec. Worth knowing what this means in practice: a teammate's
  -- designs are invisible to the rest of the business, including the
  -- owner. That's the right default for drafts, but if Design & Edit
  -- is meant to be a shared workspace this wants a dealership_id and
  -- a dealership-scoped policy instead.
  user_id uuid not null references auth.users(id) on delete cascade,

  canva_design_id text not null,
  title text,
  asset_type text not null check (asset_type in ('image', 'video')),

  -- Supabase Storage path, NOT a canva.com URL — see the 24h note in
  -- the header. Null until an export finishes.
  exported_asset_url text,

  status text not null default 'draft'
    check (status in ('draft', 'exporting', 'ready', 'failed')),

  created_at timestamptz not null default now(),

  -- Returning from the Canva editor twice for the same design must
  -- update one row, not create a second history entry for the same
  -- artwork.
  unique (user_id, canva_design_id)
);

create index if not exists idx_canva_designs_user_created
  on canva_designs(user_id, created_at desc);

-- RLS in the same file as the tables, never as a follow-up: these rows
-- hold OAuth tokens for someone's personal Canva account, and a table
-- created without policies is readable by every authenticated user
-- from the moment it exists.
alter table canva_connections enable row level security;
alter table canva_designs enable row level security;

-- `with check` is stated explicitly rather than relying on Postgres
-- reusing the `using` clause for writes. It's the clause that stops a
-- user inserting a row owned by someone else, and it should be visible
-- in the file rather than implied.
create policy "canva_connections_owner_all" on canva_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "canva_designs_owner_all" on canva_designs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
