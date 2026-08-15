-- ============================================================
-- Master audit Part E/B — multi-touch attribution, Phase A
-- (first-touch formalized + visitor-id bridge for pre-conversion
-- engagement touches).
--
-- lead_touchpoints: one row per real touch on a lead's path to
-- conversion. "creation" rows are written at every lead-creation call
-- site (5 total), deriving channel from source/meta_campaign_id —
-- this is the always-present first touch, formalizing data that
-- already existed implicitly on the leads row itself. "page_event"
-- rows are written only for /p/[slug] leads, bridged via visitor_id
-- (see page_events.visitor_id below) — these are real pre-conversion
-- engagement signals (WhatsApp CTA click, chat widget open) distinct
-- from the creation channel.
--
-- Deliberately NOT yet full multi-touch across organic/paid-social/
-- direct — that needs UTM capture, a separate, explicitly deferred
-- extension.
-- ============================================================

create table if not exists lead_touchpoints (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  dealership_id uuid references dealerships(id) on delete cascade not null,
  channel text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_touchpoints_lead_id on lead_touchpoints(lead_id);
-- Natural dedupe guard — a retried insert for the exact same
-- lead/channel/moment no-ops instead of creating a duplicate row.
create unique index if not exists idx_lead_touchpoints_dedup on lead_touchpoints(lead_id, channel, occurred_at);

alter table lead_touchpoints enable row level security;
create policy "lead_touchpoints_dealership_all" on lead_touchpoints
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- Anonymous, first-party visitor id (crypto.randomUUID(), stored in
-- the browser's own localStorage on Hawlai's domain — never a name/
-- phone/email, never sent to any third party) so a page_events row
-- recorded before someone becomes a lead can be matched back to that
-- lead once they convert. Nullable — every existing row and every
-- caller that doesn't send one keeps working unchanged, same
-- non-destructive pattern as the `variant` column added to this same
-- table in migration 044.
alter table page_events add column if not exists visitor_id text;
create index if not exists idx_page_events_dealership_visitor
  on page_events(dealership_id, visitor_id) where visitor_id is not null;
