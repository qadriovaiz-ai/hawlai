-- ============================================================
-- Landing Pages — basic Website Department
-- ============================================================
-- Gives each dealership one public, hosted landing page — the
-- missing piece that made SEO Agent's keyword ideas theoretical
-- (no page existed to actually target them) and closed the "no
-- website" gap enough to matter: a real public URL, a lead capture
-- form, and a place organic/SEO traffic can land on.

create table if not exists landing_pages (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null unique,

  slug text unique not null,
  headline text,
  subheadline text,
  offer_text text,
  hero_image_url text,

  published boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_landing_pages_slug on landing_pages(slug);

alter table landing_pages enable row level security;

-- Owner manages their own page.
create policy "landing_pages_dealership_all" on landing_pages
  for all using (
    dealership_id in (
      select id from dealerships where owner_id = auth.uid()
    )
  );

-- The public page itself is rendered server-side with the service
-- role client (bypasses RLS deliberately, since this table only ever
-- holds public marketing copy, never anything sensitive), so no
-- anon SELECT policy is needed here.

create or replace function public.set_landing_pages_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_landing_pages_update on landing_pages;
create trigger on_landing_pages_update
  before update on landing_pages
  for each row execute procedure public.set_landing_pages_updated_at();
