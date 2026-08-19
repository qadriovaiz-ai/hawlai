-- ============================================================
-- Audit Log — P0 30a
-- ============================================================
-- Immutable event trail. Free text actor/event_type, matching the
-- existing requested_by_agent/subsystem convention used elsewhere
-- (pending_approvals, automation_run_log) rather than a normalized
-- agents/tools FK table — see docs/DECISIONS.md, 32d deferred until
-- an actual need for that shape shows up.

create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Free text, e.g. 'user:<uuid>', 'master_chat_campaign_edit',
  -- 'vapi_call_tool:log_complaint', 'cron:daily_autopilot'.
  actor text not null,

  -- Free text, e.g. 'approval_approved', 'approval_rejected',
  -- 'call_tool_executed', 'campaign_auto_paused'. Not constrained by a
  -- CHECK — same reasoning as pending_approvals.action_type: a new
  -- source shouldn't need a migration to log a new event type.
  event_type text not null,

  -- What this event was about, if applicable — nullable since some
  -- events aren't about one specific record.
  resource_type text,
  resource_id uuid,

  -- One human-readable line (shown in a UI list), full structured
  -- context in details.
  summary text not null,
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz default now()
);

create index if not exists idx_audit_log_dealership_created on audit_log(dealership_id, created_at desc);
create index if not exists idx_audit_log_resource on audit_log(resource_type, resource_id) where resource_type is not null;

alter table audit_log enable row level security;

-- Immutable by design: SELECT only, for the owner. No UPDATE/DELETE
-- policy at all — nothing (not even the owner) can alter or remove a
-- row through the API surface. All INSERTs happen via the service-role
-- client from trusted server code (same trust model as
-- monthly_generation_usage/automation_run_log), never a client insert
-- policy.
create policy "audit_log_owner_select" on audit_log
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
