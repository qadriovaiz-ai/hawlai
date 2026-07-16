-- Email Marketing content generation — welcome emails, abandoned
-- cart, promotional, newsletter, sales sequences, follow-ups,
-- personalization tips. Segmentation is a separate real feature
-- (queries actual leads data, not AI-generated) and Analytics is
-- guidance-only since the Gmail integration only has send scope, no
-- open/click tracking — see emailMarketingAgent.ts.

create table if not exists email_marketing_pieces (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- e.g. 'welcome_email', 'abandoned_cart', 'sales_sequence'
  topic text,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_email_marketing_pieces_dealership_id on email_marketing_pieces(dealership_id);

alter table email_marketing_pieces enable row level security;

create policy "email_marketing_pieces_dealership_all" on email_marketing_pieces
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
