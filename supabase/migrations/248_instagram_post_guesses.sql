-- 248: what the photo of an Instagram post looked like — T3 of
-- docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
--
-- T3 ("vision fallback"): when a customer shares a post or replies to a
-- story whose caption carries no #HawlaiTag, the post's photo is compared
-- with the catalog's photos by an AI call. The plan says "cached per post":
-- otherwise every DM about the same post pays for the same comparison
-- again — and this product has already burned money on repeated calls
-- (positioning, Sept 2026).
--
-- ONE ROW PER (business, post). The guess is a GUESS — the customer is
-- always asked "is it the X?" before any price — so `confidence` is kept
-- with it, and a null product means "no match" (also worth not asking
-- again).
--
-- RLS: owner may read; only the service client (the webhook) writes.
--
-- ---- BEFORE RUNNING, against the LIVE database -------------------------
--
--   select to_regclass('public.instagram_post_guesses');
--   -- Expected: NULL.
--
-- RUN BY HAND, as every migration here is.

create table if not exists instagram_post_guesses (
  dealership_id uuid not null references dealerships(id) on delete cascade,
  media_id text not null,
  product_name text,
  confidence text not null,
  created_at timestamptz not null default now(),
  primary key (dealership_id, media_id),
  constraint instagram_post_guesses_confidence_check check (confidence in ('high', 'low', 'none'))
);

alter table instagram_post_guesses enable row level security;

drop policy if exists "instagram_post_guesses_owner_select" on instagram_post_guesses;
create policy "instagram_post_guesses_owner_select" on instagram_post_guesses
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

comment on table instagram_post_guesses is
  'Seller Mode T3: the AI''s guess of which catalog product an Instagram post shows, cached per post. A guess — customers are always asked to confirm.';

-- ---- VERIFY, after running ------------------------------------------------
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.instagram_post_guesses'::regclass order by conname;
--   -- Expected: confidence_check (high, low, none), the dealership foreign key,
--   -- the primary key (dealership_id, media_id).
--
--   select relrowsecurity from pg_class where relname = 'instagram_post_guesses';
--   -- Expected: true
--
--   select policyname, cmd from pg_policies where tablename = 'instagram_post_guesses';
--   -- Expected: one row — instagram_post_guesses_owner_select, SELECT.
