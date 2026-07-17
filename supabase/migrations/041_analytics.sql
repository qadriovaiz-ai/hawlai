-- Website Analytics + Heatmaps — real visitor event tracking on the
-- public landing page (one per dealership). Inserts happen via the
-- service client from the public tracking endpoint (unauthenticated
-- visitors), so no insert policy is needed — only a select policy for
-- the dealership owner to view their own data.

create table if not exists page_events (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  event_type text not null, -- 'view' | 'click' | 'chat_open' | 'form_submit' | 'whatsapp_click'
  x_pct numeric, -- normalized click position (0-100), only set for 'click' events
  y_pct numeric,
  created_at timestamptz default now()
);

create index if not exists idx_page_events_dealership_id on page_events(dealership_id);
create index if not exists idx_page_events_created_at on page_events(created_at desc);

alter table page_events enable row level security;

create policy "page_events_dealership_select" on page_events
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
