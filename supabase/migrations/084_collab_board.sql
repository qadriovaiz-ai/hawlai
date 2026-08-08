-- Migration 084: Open Collabs board — lets influencers discover
-- businesses on Hawlai, not just the other way around.
--
-- collab_listings: a business posts an open collaboration opportunity
-- (optionally public). collab_applications: anyone (no Hawlai account
-- needed) can apply from the public board — the dealer then converts
-- a promising application into a real row in the existing
-- `influencers` CRM table with one click.

create table if not exists collab_listings (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  title text not null,
  description text,
  compensation_type text default 'product' check (compensation_type in ('product', 'paid', 'both')),
  compensation_details text, -- e.g. "Free product + ₹500" — free text, dealer's own words

  status text default 'open' check (status in ('open', 'closed')),
  is_public boolean default true, -- dealer can flip this off without deleting the listing

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists collab_applications (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid references collab_listings(id) on delete cascade not null,
  dealership_id uuid references dealerships(id) on delete cascade not null, -- denormalized so the dealer's own RLS policy can scope applications directly, without joining through listings

  influencer_name text not null,
  handle text,
  platform text default 'instagram',
  followers_estimate integer,
  message text, -- why they're a fit / pitch, in their own words
  contact_info text, -- how the dealer reaches them back (phone/email/DM)

  status text default 'new' check (status in ('new', 'reviewed', 'converted', 'declined')),
  created_at timestamptz default now()
);

create index if not exists idx_collab_listings_dealership_id on collab_listings(dealership_id);
create index if not exists idx_collab_listings_public_open on collab_listings(is_public, status);
create index if not exists idx_collab_applications_dealership_id on collab_applications(dealership_id);
create index if not exists idx_collab_applications_listing_id on collab_applications(listing_id);

alter table collab_listings enable row level security;
alter table collab_applications enable row level security;

-- Dealer-side (dashboard) access is owner-scoped, same pattern as
-- every other table in this repo. The public board and application
-- submission both go through /api/public/* routes using the service
-- role client (like /api/public/orders already does), which
-- intentionally bypasses RLS rather than needing an anon policy here —
-- validation for public writes lives in the route itself.
create policy "collab_listings_dealership_all" on collab_listings
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create policy "collab_applications_dealership_all" on collab_applications
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

create or replace function public.set_collab_listings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_collab_listings_update on collab_listings;
create trigger on_collab_listings_update
  before update on collab_listings
  for each row execute procedure public.set_collab_listings_updated_at();
