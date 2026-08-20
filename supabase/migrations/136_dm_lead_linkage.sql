-- Cross-Channel Identity — P2 27a-iii (DM -> lead linkage)

alter table leads add column if not exists dm_source_id text;
alter table leads add column if not exists dm_channel text;
-- Non-destructive merge marker — a superseded DM-only lead stays in
-- the table, just marked, rather than being deleted. Fully undoable.
alter table leads add column if not exists merged_into_lead_id uuid references leads(id) on delete set null;
alter table auto_reply_log add column if not exists lead_id uuid references leads(id) on delete set null;

create index if not exists idx_leads_dm_source on leads(dealership_id, dm_source_id, dm_channel) where dm_source_id is not null;
create index if not exists idx_leads_merged_into on leads(merged_into_lead_id) where merged_into_lead_id is not null;

-- Same extend-the-constraint pattern as 109/110/115/121/122/124/132/135.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'competitor_alert','topic_alert','campaign_auto_paused','hot_lead','approval_pending',
    'customer_at_risk','lead_going_cold',
    'campaign_budget_warning','campaign_budget_overrun',
    'call_needs_follow_up',
    'variant_draft_generated',
    'call_escalated',
    'refund_requested',
    'goal_completed','goal_task_failed',
    'lead_merge_needs_review'
  ));
