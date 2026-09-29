-- 205: record what each stored search row was confined to.
--
-- THE PRIVACY PROBLEM THIS SUPPORTS. Search Console is connected at
-- platform level — the property is sc-domain:hawlai.online — and every
-- storefront lives at hawlai.online/site/{slug}. Until now the read sent
-- no page filter, so it returned every shop's searches at once, plus
-- Hawlai's own marketing pages, and stored the lot under whichever
-- business ran the sync. Only one business exists today, so nothing has
-- leaked; with two, one owner's dashboard would show the searches that
-- reached the other's shop.
--
-- The fix is a page filter on the API request. This column records the
-- filter each row was read under, because the numbers themselves cannot
-- say: a domain-wide row and a scoped row look identical. Null therefore
-- means exactly one thing — written before scoping existed — and
-- topQueries() refuses to return those rows to anything.
--
-- Rows written from now on always carry a value: the page regex for a
-- shop on the platform domain, or the property itself for a business
-- reading its own domain, where the property is already the scope.
--
-- Additive. No existing row changes; the old rows are deleted separately
-- (they cannot be re-attributed, only re-fetched).

alter table search_queries
  add column if not exists page_filter text;

comment on column search_queries.page_filter is
  'What this row was confined to when it was read from Search Console: the page regex for a storefront on the platform domain, or the property URL for a business own-domain property. NULL means the row predates scoping and covers the whole domain — never show it to anyone.';
