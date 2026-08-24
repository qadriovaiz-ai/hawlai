-- Storefront pixel + Meta Conversions API — retargeting piece 3/7.
--
-- VERIFIED root cause before writing: TrackingScripts.tsx renders in
-- exactly ONE place, /p/[slug] (landing pages). The actual storefront
-- — /site/[slug], its product pages, cart and checkout — had ZERO
-- third-party tracking, because `websites` has no tracking columns at
-- all. So every e-commerce event (ViewContent, AddToCart,
-- InitiateCheckout, Purchase) was firing on pages where no pixel
-- existed. Placement was the real gap, not event coverage.

-- Tracking config moves to the BUSINESS level. A business has one
-- pixel; it should apply to their storefront AND landing pages rather
-- than being re-entered per surface.
--
-- landing_pages.meta_pixel_id is deliberately LEFT IN PLACE and still
-- honoured as a per-page override — removing it would silently break
-- tracking on every landing page already configured with one.
alter table dealerships add column if not exists meta_pixel_id text;
alter table dealerships add column if not exists ga_tracking_id text;

-- Conversions API access token — server-to-server only, never reaches
-- the browser. Sits alongside the other per-business provider
-- credentials on dealerships (fb_page_access_token, google_ads_*,
-- pinterest_*, etc.), which already follow exactly this pattern.
alter table dealerships add column if not exists meta_conversions_api_token text;

-- Server-side event delivery log.
--
-- Exists for a concrete reason, not completeness: Conversions API
-- failures are otherwise INVISIBLE. Meta accepts the request and
-- reports match quality asynchronously, so a dealer whose token
-- expired would silently lose every server-side conversion with
-- nothing anywhere to show it.
create table if not exists conversion_events (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  -- Free text, same convention as audit_log.event_type — a new event
  -- type shouldn't need a migration.
  event_name text not null,
  -- The dedup key shared with the browser pixel. Meta counts the same
  -- conversion TWICE unless both the pixel and the server send an
  -- identical event_id.
  event_id text not null,
  value_inr numeric(10,2),
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  -- Also the idempotency guard: a retried webhook or double-submit
  -- can't record (or send) the same conversion twice.
  unique(dealership_id, event_name, event_id)
);

create index if not exists idx_conversion_events_dealership
  on conversion_events(dealership_id, created_at desc);

alter table conversion_events enable row level security;
create policy "conversion_events_owner_select" on conversion_events
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
