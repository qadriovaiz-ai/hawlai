-- Cookie/tracking consent — retargeting piece 2/7.
--
-- DPDP requires consent before non-essential tracking. Confirmed
-- decision: option (ii) — essential-only by default, third-party
-- tracking (and cross-session visitor identification) only after
-- explicit consent.
--
-- VERIFIED before writing, and it corrected an earlier assumption:
-- visitor_id is NOT anonymous analytics. It's a persistent
-- localStorage UUID that survives sessions, and P3's
-- bridgeVisitorTouchpoints RETROACTIVELY links it to a named lead
-- once that person converts. That's cross-session identification
-- attached to a real identity — personal-data processing, not site
-- operation. So visitor_id is consent-gated alongside the pixels,
-- while aggregate view/click counts (with visitor_id null) continue
-- unconditionally as genuine site operation.
--
-- Already null-safe end to end: /api/public/track writes
-- `visitor_id: typeof visitorId === "string" ? visitorId : null`, and
-- bridgeVisitorTouchpoints early-returns on a null visitorId — so
-- withholding the ID degrades cleanly instead of breaking anything.

-- One row per visitor per site, recording their actual choice.
-- A server-side record, not just a browser flag: under DPDP the
-- business must be able to DEMONSTRATE consent was given, and a
-- localStorage value on the visitor's own device proves nothing.
create table if not exists visitor_consent (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  visitor_id text not null,
  -- No 'pending' state on purpose: the ABSENCE of a row is pending.
  -- Storing a row for someone who never chose would record silence
  -- as a decision.
  status text not null check (status in ('granted', 'denied')),
  -- What they agreed to, so a later policy change can tell whether
  -- existing consent still covers it rather than assuming it does.
  scope text not null default 'analytics_and_ads',
  user_agent text,
  created_at timestamptz not null default now(),
  unique(dealership_id, visitor_id)
);

create index if not exists idx_visitor_consent_dealership
  on visitor_consent(dealership_id, created_at desc);

alter table visitor_consent enable row level security;

-- Owner can read their own site's consent records (needed to
-- demonstrate compliance). Writes come from the public storefront via
-- the service-role client — a visitor has no auth session, so there
-- is no policy that could meaningfully scope their insert.
create policy "visitor_consent_owner_select" on visitor_consent
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- What the visitor had consented to at the moment each event fired.
-- Without this, a later withdrawal leaves no way to tell which
-- historical rows were collected lawfully.
--
-- NULLABLE, deliberately not defaulted to false: every existing row
-- predates consent tracking entirely. Marking them false would assert
-- "we know consent was denied", which is untrue. null honestly means
-- "collected before consent tracking existed".
alter table page_events add column if not exists consent_granted boolean;
