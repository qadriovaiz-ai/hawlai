-- ============================================================
-- Brand Profiles — foundation for the AI Marketing OS
-- ============================================================
-- Stores each dealership's brand voice, target persona and
-- messaging style so the Content, Creative and future agents
-- can generate consistent, on-brand output instead of guessing
-- tone from scratch on every request.

create table if not exists brand_profiles (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null unique,

  -- How the brand should sound. Free text so Claude prompts can
  -- read it directly, e.g. "Trustworthy, family-friendly, no hard-sell".
  tone_of_voice text,

  -- Structured persona info, e.g.
  -- { "age_range": "30-45", "income": "middle class", "concerns": ["EMI", "resale value"] }
  target_persona jsonb default '{}'::jsonb,

  -- Key messages the brand always wants represented, e.g.
  -- ["0% down payment available", "Free RC transfer", "20 years in Lucknow"]
  messaging_pillars jsonb default '[]'::jsonb,

  -- "hinglish" | "hindi" | "english" — lets Content Agent match
  -- the dealer's preferred customer-facing language.
  preferred_language text default 'hinglish',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_brand_profiles_dealership_id on brand_profiles(dealership_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table brand_profiles enable row level security;

create policy "brand_profiles_dealership_all" on brand_profiles
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );

-- ============================================================
-- Keep updated_at fresh on every edit
-- ============================================================

create or replace function public.set_brand_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_brand_profiles_update on brand_profiles;
create trigger on_brand_profiles_update
  before update on brand_profiles
  for each row execute procedure public.set_brand_profiles_updated_at();
