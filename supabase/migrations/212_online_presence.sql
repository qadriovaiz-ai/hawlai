-- 212: where the business already lives online — onboarding P1.
--
-- The redesign's first screen asks "Where does your business live
-- online?" — Website, Google Maps, Social media only, or Just
-- starting. That answer decides what the SECOND screen asks, so it has
-- to be stored rather than held in React state and thrown away.
--
-- WHY NOT product_mode. The obvious move is to reuse it, and it is
-- wrong: `product_mode` (migration 149) is WHAT THE OWNER WANTS —
-- calling, marketing, automation, research, website, full — and it is
-- read to decide which dashboard sections appear and by the pricing
-- tiers. "Where are you online" is a different axis entirely.
-- Overloading one column with two questions would change what every
-- new customer's dashboard shows, which is not what onboarding was
-- asked to do. Both are kept, and step 1 asks both.
--
-- online_presence_detail HOLDS WHATEVER THAT BRANCH COLLECTS: a
-- website URL, a Maps listing link, or a social handle. One nullable
-- text column rather than three, because exactly one can ever be set —
-- the branch is chosen by online_presence — and three columns would
-- invite a row with two of them filled and no way to say which the
-- owner meant.
--
-- NO DEFAULT, AND NULL IS MEANINGFUL: it means never asked, which is
-- every business that signed up before this screen existed. The same
-- distinction migration 149 drew for product_mode, for the same
-- reason.

alter table dealerships add column if not exists online_presence text;
alter table dealerships add column if not exists online_presence_detail text;

alter table dealerships drop constraint if exists dealerships_online_presence_check;
alter table dealerships
  add constraint dealerships_online_presence_check
  check (online_presence is null or online_presence in ('website', 'maps', 'social', 'none'));

comment on column dealerships.online_presence is
  'Onboarding step 1: where the business already lives online — website | maps | social | none. NULL means never asked. Decides what step 2 collects; see src/lib/onboarding/steps.ts connectKindFor(). NOT the same as product_mode, which is what the owner wants from Hawlai.';
comment on column dealerships.online_presence_detail is
  'Whatever step 2 collected for that presence: a website URL, a Google Maps listing link, or a social handle. One column because exactly one can be set.';
