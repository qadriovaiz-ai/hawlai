-- A note the owner keeps, that no customer is ever told.
--
-- WHY, 13 November 2026. Until V4a the sales agent lived on one
-- quick-launch landing page. It is now on every page of the storefront,
-- so everything in `business_knowledge` is one question away from being
-- read aloud to a stranger.
--
-- Five of the six categories are customer-facing by design (hours,
-- pricing_note, policy, faq, business_story) and a content-based consent
-- gate already withholds anything telling a third party's private
-- situation, whatever category it sits in. `general` is the catch-all,
-- and it is where a supplier's name, a cost, a margin or a note-to-self
-- would land. There was no way to write one down and keep it in.
--
-- NOT RESTRICTED TO `general`, DELIBERATELY. The flag is on every row.
-- A CHECK tying it to one category would have to be migrated again the
-- first time the owner marks a policy note internal, and "this is not
-- for customers" is a true thing to say about any row.
--
-- DEFAULT FALSE, which is the ONLY safe default in this direction: it
-- leaves every existing note exactly as customer-facing as it was
-- yesterday. The opposite default would silently remove notes from
-- answers the business already relies on, and the owner would find out
-- from a customer.
--
-- Set by the owner alone, on the Business Knowledge page. Nothing
-- infers it: "is this internal?" is a judgement about her own business,
-- and a pattern that guessed would be wrong in the expensive direction
-- either way.

alter table business_knowledge
  add column if not exists internal_only boolean not null default false;

comment on column business_knowledge.internal_only is
  'The owner marked this note internal: never shown to a customer and never used in generated copy. Set by the owner only.';

-- VERIFY. Expected: one row — internal_only | boolean | NO | false.
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name = 'business_knowledge' and column_name = 'internal_only';
--
-- AND: every existing note is unchanged. Expected: 0.
--
-- select count(*) from business_knowledge where internal_only = true;
