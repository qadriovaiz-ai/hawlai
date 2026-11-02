-- 213: the two things step 4 asks for that had nowhere to go —
-- onboarding P4.
--
-- brand_profiles (migration 005) already holds tone_of_voice and
-- preferred_language, so step 4's LANGUAGE pills need no column at all.
-- Colours and tone TAGS do.
--
-- WHY NOT brand_kits. That table (migration 027) holds a whole
-- GENERATED kit as one JSON blob — colours, typography, tagline,
-- mission, story. Three colours the owner picked himself in onboarding
-- are a different thing from a kit a model produced, and burying them
-- inside that blob would mean every reader of "the brand's colours"
-- having to know which of the two to trust.
--
-- WHY tone_tags AND NOT JUST tone_of_voice. tone_of_voice is FREE TEXT
-- that prompts read directly, all over this codebase. Replacing it with
-- an array would quietly change what every agent sees. So step 4 writes
-- both: the array the pills own, and tone_of_voice composed from it as
-- a sentence, so every existing reader keeps working unchanged.
-- src/lib/onboarding/brand.ts composeToneOfVoice() is the only place
-- that composition happens, and a test pins it.
--
-- BOTH DEFAULT TO AN EMPTY ARRAY, never null, so "has the owner
-- answered?" is a length check for every caller rather than a null
-- check and a length check. The CHECKs keep them arrays: a reader that
-- maps over this must not be handed an object.

alter table brand_profiles add column if not exists brand_colors jsonb not null default '[]'::jsonb;
alter table brand_profiles add column if not exists tone_tags jsonb not null default '[]'::jsonb;

alter table brand_profiles drop constraint if exists brand_profiles_brand_colors_is_array;
alter table brand_profiles
  add constraint brand_profiles_brand_colors_is_array
  check (jsonb_typeof(brand_colors) = 'array');

alter table brand_profiles drop constraint if exists brand_profiles_tone_tags_is_array;
alter table brand_profiles
  add constraint brand_profiles_tone_tags_is_array
  check (jsonb_typeof(tone_tags) = 'array');

comment on column brand_profiles.brand_colors is
  'Colours the OWNER picked in onboarding step 4, as a JSON array of #rrggbb strings. Distinct from brand_kits, which holds a model-generated kit. Empty array means never answered.';
comment on column brand_profiles.tone_tags is
  'Tone words the owner picked in onboarding step 4, as a JSON array. tone_of_voice is composed from these by src/lib/onboarding/brand.ts composeToneOfVoice() and stays the free text every prompt reads. Empty array means never answered.';
