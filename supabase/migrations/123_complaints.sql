-- Migration 123: complaints table — Phase 3 piece 3 ("Complaint
-- Handling") of the AI Communication Employee. A real record, not
-- just a fire-and-forget alert: the existing Phase 2 piece 1
-- notification (call_needs_follow_up) stays as a post-call safety net
-- for calls the AI didn't proactively log a complaint on, but this
-- gives complaints their own trackable lifecycle (open -> in_progress
-- -> resolved), separate from escalations (migration 122) per
-- explicit decision — a complaint is about what went wrong, an
-- escalation is about the AI needing help right now.
--
-- This file was approved and run directly in Supabase at the time —
-- no file was written for it then. Backfilled here (documentation
-- only, matching the Master Spec audit's finding that this migration
-- was missing) so the migrations folder stays a complete record. DO
-- NOT RE-RUN against production — the table is already live.

create table if not exists complaints (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete cascade not null,
  call_id uuid references calls(id) on delete set null,
  order_id uuid references orders(id) on delete set null,

  description text not null, -- captured in the caller's own specifics, not the post-call classifier's one-line guess
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  resolution_notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists idx_complaints_dealership_id on complaints(dealership_id, status);

alter table complaints enable row level security;

create policy "complaints_dealership_all" on complaints
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
