-- ============================================================
-- Pending Approvals — Human Approval Layer
-- ============================================================
-- Any agent action that crosses a budget/impact threshold writes
-- a row here instead of executing directly. The dealer/founder
-- sees it on the dashboard and must Approve or Reject before the
-- action actually runs. This is what makes it safe to let future
-- agents (Paid Ads, Optimization, etc.) act with less hand-holding.

create table if not exists pending_approvals (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Which agent/feature raised this request, e.g. 'paid_ads_agent',
  -- 'optimization_agent'. Free text for now, agent names aren't
  -- enforced at the DB level.
  requested_by_agent text not null,

  -- Short machine-readable action type, e.g. 'launch_campaign',
  -- 'increase_budget', 'pause_campaign'.
  action_type text not null,

  -- Everything the dashboard needs to show the dealer full context
  -- before they approve/reject, e.g.
  -- { "campaign_name": "Diwali Sale", "daily_budget": 75000, "duration_days": 7 }
  action_details jsonb not null default '{}'::jsonb,

  -- The rupee amount this action involves, if any. Used to compare
  -- against a dealership's approval threshold. Null for actions that
  -- aren't budget-related (e.g. pausing a campaign).
  amount numeric,

  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),

  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,

  created_at timestamptz default now()
);

create index if not exists idx_pending_approvals_dealership_id on pending_approvals(dealership_id);
create index if not exists idx_pending_approvals_status on pending_approvals(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table pending_approvals enable row level security;

create policy "pending_approvals_dealership_all" on pending_approvals
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );

-- ============================================================
-- Approval threshold lives on the dealership itself — each dealer
-- (or industry pack, later) can set their own ₹ ceiling above which
-- actions require manual approval. Defaults to ₹50,000 as discussed.
-- ============================================================

alter table dealerships add column if not exists approval_threshold numeric default 50000;
