-- 249: where each product is sold — 28 November 2026.
--
-- THE FOUNDER'S ASK: every product gets one switch — Instagram only,
-- Website only, or Both (default Both). An Instagram-only product is not
-- shown on the website; a Website-only product is not offered in
-- Instagram DM selling.
--
-- 'both' is the default so every existing product keeps doing exactly
-- what it does today — nothing disappears from anywhere on the day this
-- runs.
--
-- (247 is held by unmerged work; 248 is instagram_post_guesses.)
--
-- RUN BY HAND, as every migration here is. ONE Run: the check, the
-- change and the assertion are in one transaction — if the assertion
-- fails, nothing is kept.

begin;

-- BEFORE: nothing of this may exist yet. Checked live 28 Nov 2026 (the
-- column was missing); this guards against a second run or drift.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'products_sales_channel_check') then
    raise exception 'products_sales_channel_check already exists: %',
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'products_sales_channel_check');
  end if;
end $$;

alter table products add column if not exists sales_channel text not null default 'both';

alter table products add constraint products_sales_channel_check
  check (sales_channel in ('both', 'website', 'instagram'));

comment on column products.sales_channel is
  'Where the product is sold: both (default), website (not offered in Instagram DM selling), instagram (not shown on the website).';

-- ASSERT, inside the transaction.
do $$
declare
  def text;
  not_both int;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'products_sales_channel_check';
  if def is null or def not like '%both%' or def not like '%website%' or def not like '%instagram%' then
    raise exception 'constraint not as expected: %', def;
  end if;
  select count(*) into not_both from products where sales_channel <> 'both';
  if not_both <> 0 then raise exception '% products are not ''both'' after adding the column', not_both; end if;
end $$;

commit;

-- ---- VERIFY, after running (a separate Run is fine — read only) ----------
--
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_name = 'products' and column_name = 'sales_channel';
--   -- Expected: one row — text, default 'both'::text, is_nullable NO.
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'products_sales_channel_check';
--   -- Expected: CHECK ((sales_channel = ANY (ARRAY['both'::text, 'website'::text, 'instagram'::text])))
--
--   select sales_channel, count(*) from products group by 1;
--   -- Expected: only 'both', with every product counted.
