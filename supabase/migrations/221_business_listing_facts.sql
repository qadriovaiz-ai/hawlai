-- ============================================================
-- The listing's facts — somewhere truthful to put them
-- ============================================================
-- I1 of docs/PLAN-AUTO-INTERVIEW.md, which is L1 of
-- docs/PLAN-LOCAL-SEO.md with the interview automated.
--
-- WHY THIS TABLE EXISTS AT ALL. The claims guard's own header records
-- the reason, dated: "Nothing in Hawlai stores a public contact email,
-- a public phone number or a social handle for a business, so there was
-- nothing to check against and the model filled the gap the way models
-- do." What it filled it with was hello@candlebyqaaf.com, on a live
-- contact page, for a domain the business did not own — so every
-- enquiry sent to it would have vanished silently for as long as the
-- site stayed up.
--
-- A column is not a fix for a model inventing things; the guard is. But
-- a business that HAS a phone number and no column to keep it in will
-- keep having that gap filled for it, and `businessNode` publishes the
-- city and nothing else because the city is the only fact it has.
--
-- WHY A TABLE AND NOT MORE COLUMNS ON `dealerships`. That row is
-- already carrying fb_*, google_ads_*, instagram_*, whatsapp_*,
-- razorpay_* and more, and these facts are a set with their own
-- lifecycle: collected together, published together, and each one
-- paired with the owner's decision about whether it may be published at
-- all. One row per business, so there is no "which of these is
-- current".
--
-- EVERY VALUE HAS A PUBLISH DECISION NEXT TO IT, and that is the point
-- of the shape. A phone number Hawlai knows is not the same as a phone
-- number the owner wants on a public page, and `owner_whatsapp_number`
-- on `dealerships` is the standing example of the difference: it exists
-- so Hawlai can message the OWNER. Publishing it because it happened to
-- be in the database would be a second use of a fact he gave for a
-- first one.
--
-- NO geo COLUMN, deliberately. The local plan says "geo, if the Place
-- record has it" — nothing in this product reads a Place's coordinates
-- today, and the interview does not ask for them because an owner
-- typing their own latitude is not a thing that happens. A column
-- nothing can fill is schema without a purpose; it goes in when
-- something can write it.
--
-- NO aggregateRating, NO reviews, and no column for either. Publishing
-- Google's own rating inside your own page's markup breaches their
-- guidelines, and structuredData.ts already says why in the one place
-- someone would look: "a rating is the single most tempting thing to
-- invent and the most damaging to get wrong."
--
-- RUN BY HAND, as every migration here is.

create table if not exists business_listing_facts (
  id uuid primary key default uuid_generate_v4(),

  -- UNIQUE: one set of listing facts per business. A second row would
  -- be a second answer to "what is this business's phone number", and
  -- nothing downstream could choose between them.
  dealership_id uuid references dealerships(id) on delete cascade not null unique,

  -- ---- the phone -------------------------------------------------
  --
  -- Stored as the owner typed it. NOT normalised here: an Indian number
  -- is written "+91 91234 56789", "091234 56789" and "9123456789" by
  -- the same person in the same week, and a migration that picks one
  -- spelling would be making a display decision in the database. The
  -- claims guard's EMAIL/phone patterns already know how to read all
  -- three spellings (that lesson is recorded in guardBlocks.ts).
  public_phone text,
  publish_phone boolean not null default false,

  -- ---- the hours -------------------------------------------------
  --
  -- jsonb, as an ARRAY OF INTERVALS rather than one row per day:
  --
  --   [{"day":"monday","opens":"10:00","closes":"14:00"},
  --    {"day":"monday","opens":"15:00","closes":"19:00"},
  --    {"day":"sunday","opens":null,"closes":null}]
  --
  -- Two intervals for one day is how a lunch break is said, and it is
  -- also exactly what schema.org's openingHoursSpecification takes. A
  -- day with nulls is CLOSED, stated rather than absent — a missing day
  -- means nobody answered, and those are different facts.
  --
  -- NO CHECK CONSTRAINT ON THE SHAPE. Migration 170's reasoning,
  -- reused rather than re-argued: the policy is code and moves faster
  -- than migrations, and a mismatch is caught by a test rather than by
  -- a failed insert at the worst possible moment. src/lib/seo/
  -- listingFacts.ts is the only thing that may read or write this, and
  -- it refuses a shape it does not recognise instead of publishing it.
  opening_hours jsonb not null default '[]'::jsonb,

  -- ---- where he actually serves ----------------------------------
  --
  -- text[], as `dealerships.business_models` (186) does it.
  --
  -- THE ONE FIELD MOST LIKELY TO BE ANSWERED TOO GENEROUSLY. "All over
  -- India" from a business that has shipped once outside its own state
  -- is the kind of line the guard exists to remove — and once it is in
  -- here it is EVIDENCE, because knownText treats a recorded fact as
  -- proof. The interview asks where he has actually sent something, not
  -- where he would.
  areas_served text[] not null default '{}',

  -- ---- the address -----------------------------------------------
  --
  -- The city stays on `dealerships` where every other reader already
  -- finds it. This is the street line, and it is separate because
  -- publishing it is a decision with a consequence: a great many
  -- businesses here run from the owner's home.
  --
  -- Default false, so a street address that is collected is not
  -- published by having been collected.
  street_address text,
  publish_street_address boolean not null default false,

  -- ---- sameAs ----------------------------------------------------
  --
  -- How a machine learns that the site, the Maps listing and the
  -- Instagram account are ONE business rather than three things sharing
  -- a name.
  --
  -- ONLY WHAT CANNOT BE DERIVED LIVES HERE. `dealerships.google_place_id`
  -- (103) already gives the Maps listing and `dealerships.fb_page_id`
  -- (004) already gives the Facebook page, so neither gets a column —
  -- two spellings of one fact is how they come to disagree. Instagram
  -- does need one: only `instagram_business_id` is stored, which is not
  -- a public profile URL and cannot be turned into one.
  instagram_url text,

  -- JustDial, IndiaMART, a Zomato or Practo page, an older site. A
  -- jsonb array of plain URL strings; listingFacts.ts rejects anything
  -- that is not an http(s) URL rather than publishing it.
  other_profile_urls jsonb not null default '[]'::jsonb,

  -- ---- who answered, and when ------------------------------------
  --
  -- WHY PROVENANCE IS ON THIS TABLE. These facts are published as
  -- machine-readable statements about a real business, and the interview
  -- that collects them runs without a person checking it. "The owner
  -- typed this on 7 November" is the difference between a fact and a
  -- value that appeared.
  --
  -- 'owner' is the only value anything writes today. There is no model
  -- path into this table and the plan says there must not be one: no
  -- question here is ever answered from a guess about the category.
  answered_by text not null default 'owner',
  answered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_listing_facts_dealership_id
  on business_listing_facts(dealership_id);

comment on table business_listing_facts is
  'The listing facts a storefront can publish about itself — phone, hours, areas served, street address, sameAs. Each value carries the owner''s decision about whether it may be published. I1 of PLAN-AUTO-INTERVIEW.md.';

comment on column business_listing_facts.publish_phone is
  'Whether the owner said this number may appear on a public page. A number Hawlai knows is not a number he asked to publish — see dealerships.owner_whatsapp_number, which exists so Hawlai can message HIM.';

comment on column business_listing_facts.opening_hours is
  'Array of {day, opens, closes} intervals; two for one day is a lunch break, nulls mean closed, and a missing day means nobody answered. Shape is enforced by src/lib/seo/listingFacts.ts and its test, not by a CHECK.';

comment on column business_listing_facts.areas_served is
  'Where the business has ACTUALLY served, not where it would. knownText treats a recorded fact as proof, so a generous answer here becomes a supported claim everywhere.';

comment on column business_listing_facts.answered_by is
  'Who put these on record. Only ''owner'' is written today: there is no model path into this table, deliberately.';

-- ---- RLS --------------------------------------------------------
--
-- From the start, and both halves. Migration 148's pattern: the owner
-- reads his own, an active team member reads the business they are on,
-- and there is NO client write policy at all — writes go through the
-- service-role client from a route that has already checked the caller
-- owns the business.
--
-- Two new tables shipped without RLS during the pricing-tiers work and
-- were caught afterwards. This one does not repeat it.

alter table business_listing_facts enable row level security;

drop policy if exists "business_listing_facts_owner_select" on business_listing_facts;
create policy "business_listing_facts_owner_select" on business_listing_facts
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

drop policy if exists "business_listing_facts_member_select" on business_listing_facts;
create policy "business_listing_facts_member_select" on business_listing_facts
  for select using (
    dealership_id in (
      select dealership_id from team_members where user_id = auth.uid() and status = 'active'
    )
  );

-- ---- verify -----------------------------------------------------
--
-- Run this after the migration. It should print the table with both
-- policies and rowsecurity = true.
--
--   select relname, relrowsecurity
--   from pg_class where relname = 'business_listing_facts';
--
--   select polname, cmd from pg_policies
--   where tablename = 'business_listing_facts' order by polname;
--
-- Expected: relrowsecurity = t, and exactly two SELECT policies —
-- business_listing_facts_member_select and
-- business_listing_facts_owner_select.
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'business_listing_facts' order by ordinal_position;
--
-- Expected: publish_phone and publish_street_address both
-- `boolean / NO / false` — a value collected is not a value published.
