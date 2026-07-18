-- Reporting. Live current-state numbers already exist (Reports page,
-- generateExecutiveReport/generateGrowthReport). This adds real
-- Weekly/Monthly Reports (point-in-time snapshots saved on a
-- schedule, not just "right now"), Client Reports (a public,
-- no-login shareable link — same pattern as booking_slug/
-- calendar_token), and downloadable PDF Reports / Presentation
-- Generation (see api/reports/pdf and api/reports/presentation,
-- generated server-side on demand, not stored).

create table if not exists report_snapshots (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  period_type text not null, -- 'weekly' | 'monthly'
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_report_snapshots_dealership_id on report_snapshots(dealership_id);

alter table report_snapshots enable row level security;

create policy "report_snapshots_dealership_select" on report_snapshots
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- Private random token for the client-facing shareable report page —
-- separate from booking_slug (meant to be public/guessable) since
-- this exposes revenue/spend numbers and should only go to people the
-- dealer explicitly shares the link with.
alter table dealerships add column if not exists report_share_token text unique;
