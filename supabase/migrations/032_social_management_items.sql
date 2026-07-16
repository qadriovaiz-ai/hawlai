-- Social Media Management — the tasks not already covered by the
-- existing Social Media page (which does caption generation, posting,
-- scheduling, and influencer outreach): reply suggestions, DM
-- automation templates, comment reply suggestions, community
-- management guidelines, engagement analysis, growth strategy, viral
-- trend detection. Live analytics already exists at /dashboard/insights
-- and isn't duplicated here.

create table if not exists social_management_items (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- e.g. 'reply_suggestions', 'growth_strategy', 'viral_trends'
  input_text text,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_social_management_items_dealership_id on social_management_items(dealership_id);

alter table social_management_items enable row level security;

create policy "social_management_items_dealership_all" on social_management_items
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
