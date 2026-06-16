-- ============================================================
-- AutoPilot AI - Full Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists dealerships (
  id uuid primary key default uuid_generate_v4(),
  dealership_name text not null,
  city text,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  dealership_id uuid references dealerships(id) on delete set null,
  full_name text,
  role text default 'owner',
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  name text not null,
  phone text,
  email text,
  vehicle text,
  purchase_year integer,
  budget numeric,
  source text default 'csv_upload',
  ai_score integer default 0,
  lead_temperature text default 'cold' check (lead_temperature in ('hot', 'warm', 'cold')),
  status text default 'new' check (status in ('new', 'ready_to_call', 'called', 'appointment_set', 'converted', 'not_interested')),
  qualification_reason text,
  created_at timestamptz default now()
);

create table if not exists calls (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  dealership_id uuid references dealerships(id) on delete cascade not null,
  status text default 'completed' check (status in ('completed', 'no_answer', 'busy', 'failed', 'voicemail')),
  duration integer default 0,
  summary text,
  transcript text,
  created_at timestamptz default now()
);

create table if not exists appointments (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  dealership_id uuid references dealerships(id) on delete cascade not null,
  appointment_date timestamptz not null,
  appointment_type text default 'showroom_visit' check (appointment_type in ('test_ride', 'showroom_visit')),
  status text default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_leads_dealership_id on leads(dealership_id);
create index if not exists idx_leads_temperature on leads(lead_temperature);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_calls_lead_id on calls(lead_id);
create index if not exists idx_calls_dealership_id on calls(dealership_id);
create index if not exists idx_appointments_lead_id on appointments(lead_id);
create index if not exists idx_appointments_dealership_id on appointments(dealership_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table dealerships enable row level security;
alter table profiles enable row level security;
alter table leads enable row level security;
alter table calls enable row level security;
alter table appointments enable row level security;

-- Dealerships: owner can read/write their own
create policy "dealerships_owner_all" on dealerships
  for all using (owner_id = auth.uid());

-- Profiles: user can manage their own
create policy "profiles_own" on profiles
  for all using (id = auth.uid());

-- Leads: dealer can manage their own leads
create policy "leads_dealership_all" on leads
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );

-- Calls: dealer can manage their calls
create policy "calls_dealership_all" on calls
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );

-- Appointments: dealer can manage their appointments
create policy "appointments_dealership_all" on appointments
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );

-- ============================================================
-- FUNCTION: Auto-create profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'owner');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
