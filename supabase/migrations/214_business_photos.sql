-- 214: the photos a business gives Hawlai — onboarding P5.
--
-- WHY A TABLE AND NOT JUST STORAGE. Logos are already uploaded and
-- never recorded anywhere; src/app/dashboard/assets/page.tsx finds them
-- by LISTING THE STORAGE FOLDER, and says so in a comment: "saved to
-- storage but never tracked in a table". That works for showing a
-- gallery and does not work for this screen, which has to COUNT the
-- photos to enforce "at least one before you can continue". A gate
-- whose number comes from a folder listing is a gate that fails open
-- the first time the listing is slow, paginated or denied.
--
-- And the photos are meant to be used afterwards — posts, ads, the
-- site — which means something has to be able to find them by business
-- rather than by guessing a path.
--
-- NO NEW BUCKET. These live under business-photos/<dealership_id>/ in
-- the existing `ad-creatives` bucket, the same one logos, hero images
-- and generated creatives already use. A new bucket is a step the owner
-- would have to do by hand in the Supabase dashboard, and nothing here
-- needs a different access policy.
--
-- storage_path IS UNIQUE, so a retried upload that already landed
-- cannot produce two rows for one file and make the count wrong in the
-- other direction.
--
-- `kind` IS FREE TEXT AND NULLABLE on purpose. The design suggests
-- product, shop and packaging; those are three examples of what a
-- photo might be, not a closed set every trade on earth fits into
-- (CLAUDE.md rule 3). A CHECK here would be this product deciding what
-- kinds of business exist.

create table if not exists business_photos (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,

  -- Where it actually is, so it can be deleted from storage later.
  storage_path text not null unique,
  -- The URL the app renders. Stored rather than rebuilt, so a change in
  -- how public URLs are formed does not silently break every photo.
  public_url text not null,

  -- What the owner says it is, in their words, or nothing.
  kind text,

  created_at timestamptz not null default now()
);

comment on table business_photos is
  'Photos the owner gave during onboarding step 5, and afterwards. Recorded rather than left in storage because the "at least one photo" gate has to COUNT them, and because posts and ads need to find them by business. Files live under business-photos/<dealership_id>/ in the ad-creatives bucket.';

comment on column business_photos.storage_path is
  'Path inside the ad-creatives bucket. UNIQUE: a retried upload that already landed must not produce a second row and a wrong count.';

comment on column business_photos.kind is
  'What the owner says this is, in their own words, or null. Deliberately unconstrained: a CHECK here would be this product deciding which kinds of business exist.';

create index if not exists idx_business_photos_dealership
  on business_photos(dealership_id, created_at desc);

alter table business_photos enable row level security;

drop policy if exists "business_photos_dealership_all" on business_photos;
create policy "business_photos_dealership_all" on business_photos
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
