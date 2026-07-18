-- Influencer Marketing. Finding influencers and Outreach messages/
-- emails already exist (InfluencerOutreach.tsx, Social Media page —
-- honestly scoped as search terms + drafts since there's no paid
-- influencer database connected). This adds real Collaboration
-- Management, ROI Tracking, and Campaign Monitoring as a single
-- lightweight CRM table — the dealer tracks each influencer
-- relationship through a status pipeline and logs real cost/leads/
-- revenue numbers themselves (since there's no automated attribution
-- pixel wired to individual influencers), so ROI is computed from
-- real dealer-entered numbers, not fabricated.

create table if not exists influencers (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  name text not null,
  handle text,
  platform text default 'instagram', -- 'instagram' | 'youtube' | 'facebook' | 'other'
  followers_estimate integer,
  contact_info text,

  status text default 'identified' check (status in ('identified', 'contacted', 'negotiating', 'agreed', 'active', 'completed', 'declined')),
  campaign_name text,
  start_date date,
  end_date date,

  agreed_amount numeric default 0, -- cost of the collaboration
  leads_generated integer default 0, -- dealer-logged, real numbers they track
  revenue_generated numeric default 0,

  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_influencers_dealership_id on influencers(dealership_id);

alter table influencers enable row level security;

create policy "influencers_dealership_all" on influencers
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create or replace function public.set_influencers_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_influencers_update on influencers;
create trigger on_influencers_update
  before update on influencers
  for each row execute procedure public.set_influencers_updated_at();
