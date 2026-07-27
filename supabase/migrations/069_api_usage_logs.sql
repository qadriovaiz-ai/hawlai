-- Real, exact usage logging — one row per actual API call, with the
-- exact token/duration counts the provider returned and the exact
-- cost computed from real per-unit pricing at log time. This is what
-- makes /dashboard/admin/spend an actual reconciliation instead of a
-- round-number estimate — the same pattern Claude.ai, Replit, and
-- similar platforms use internally for their own cost dashboards.
--
-- Deliberately NOT retrofitted into every single API call site in one
-- pass (there are 20+ raw fetch() call sites across the codebase) —
-- wired into the highest-traffic ones first (Master Chat, the calling
-- webhook). Anything not yet instrumented is absent from this table
-- rather than guessed at, and the admin dashboard says so explicitly
-- rather than blending in old estimates silently.
create table if not exists api_usage_logs (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  service text not null, -- 'anthropic' | 'vapi' | 'gemini' | 'elevenlabs'
  operation text not null, -- e.g. 'master_chat', 'ai_call', 'content_generation'

  input_tokens integer, -- LLM calls only
  output_tokens integer,
  duration_seconds integer, -- calls/voiceover only

  cost_inr numeric(10,4) not null, -- computed at log time from real per-unit pricing, never re-derived later

  created_at timestamptz default now()
);

create index if not exists idx_api_usage_logs_dealership_id on api_usage_logs(dealership_id);
create index if not exists idx_api_usage_logs_created_at on api_usage_logs(created_at);
create index if not exists idx_api_usage_logs_service on api_usage_logs(service);

alter table api_usage_logs enable row level security;

-- Individual businesses can read their own log rows (for their own
-- usage dashboard) but never write to it directly — only server-side
-- code (service role) inserts rows, so a business can't fabricate or
-- delete its own usage history.
drop policy if exists "api_usage_logs_dealership_read" on api_usage_logs;
create policy "api_usage_logs_dealership_read" on api_usage_logs
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
