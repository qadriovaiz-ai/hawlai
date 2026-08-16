-- Migration 124: refund_requests table + notifications.kind extension
-- — Phase 3 piece 4 ("Refund Workflow"), the last piece of Phase 3.
--
-- Real money movement never happens from a live call. This table only
-- ever records a REQUEST — status starts at 'requested' and only a
-- human, via the dashboard, can move it to 'approved'/'rejected', at
-- which point (and only then) the actual Razorpay refund API gets
-- called and razorpay_refund_id gets filled in. The live-call tool
-- this feeds can never reach Razorpay directly.

create table if not exists refund_requests (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  order_id uuid references orders(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete set null,
  call_id uuid references calls(id) on delete set null,

  reason text not null,
  requested_amount numeric not null check (requested_amount > 0),
  requested_via text not null default 'call' check (requested_via in ('call', 'chat', 'dashboard')),

  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'processed')),
  razorpay_refund_id text, -- filled only once actually processed via Razorpay's refund API
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_refund_requests_dealership_id on refund_requests(dealership_id, status);

alter table refund_requests enable row level security;

create policy "refund_requests_dealership_all" on refund_requests
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

-- Same extend-the-constraint pattern as 109/110/115/121/122.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'call_needs_follow_up',
    'variant_draft_generated',
    'call_escalated',
    'refund_requested'
  ));
