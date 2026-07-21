-- Domain Purchase System — lets a business request a real custom
-- domain (e.g. "mybrand.com") for their Website Builder site, instead
-- of staying on the free hawlai.vercel.app/site/[slug] subdomain.
--
-- Registrar-agnostic by design: domain_orders.registrar records which
-- backend actually fulfilled the purchase (see src/lib/domains/ for the
-- pluggable adapter interface — Vercel Domains API and ResellerClub are
-- both wired at the code level, selected at runtime by whichever has
-- credentials configured). No registrar has live credentials yet, so
-- every order starts life as 'requested' and is fulfilled manually by
-- the Hawlai team until a registrar + a payment collection method are
-- both connected — we never fabricate a "purchased" or "connected"
-- state without a real transaction behind it.

create table if not exists domain_orders (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  website_id uuid references websites(id) on delete cascade not null,

  domain_name text not null, -- e.g. "mybrand.com"
  registrar text, -- 'vercel' | 'resellerclub' | null (not yet chosen/fulfilled)

  price_estimate numeric(10,2),
  currency text default 'INR',

  -- requested: owner asked for it, nothing charged yet
  -- awaiting_payment: cost communicated, waiting on the owner to pay
  -- purchased: registrar transaction completed
  -- connected: DNS/Vercel attachment done, domain is live on the site
  -- unavailable: domain wasn't available to register
  -- cancelled: owner or Hawlai cancelled the request
  status text default 'requested',

  notes text, -- internal fulfillment notes (manual steps taken, contact info, etc.)
  requested_at timestamptz default now(),
  purchased_at timestamptz,
  connected_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The live, connected domain for a site (once fulfilled) lives directly
-- on the website row so rendering/routing can check it in one query.
alter table websites add column if not exists custom_domain text;
alter table websites add column if not exists custom_domain_status text; -- 'none' | 'pending' | 'connected'

create index if not exists idx_domain_orders_dealership_id on domain_orders(dealership_id);
create index if not exists idx_domain_orders_website_id on domain_orders(website_id);

alter table domain_orders enable row level security;

drop policy if exists "domain_orders_dealership_all" on domain_orders;
create policy "domain_orders_dealership_all" on domain_orders
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop trigger if exists on_domain_orders_update on domain_orders;
create trigger on_domain_orders_update
  before update on domain_orders
  for each row execute procedure public.set_ecommerce_updated_at();
