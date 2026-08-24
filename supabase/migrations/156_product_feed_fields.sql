-- Product feed fields — retargeting piece 7/7 (dynamic remarketing).
--
-- VERIFIED against both specs before writing, and they genuinely
-- differ in ways that would silently break a feed:
--   availability — Google: 'in_stock'/'out_of_stock' (underscores).
--                  Meta:   'in stock'/'out of stock' (spaces).
--                  Same concept, incompatible strings, so one feed
--                  cannot serve both without per-platform formatting.
--   price        — Google wants '1500.00 INR' as a single string;
--                  Meta accepts the same, so that format is used for
--                  both.
--   brand        — required by BOTH for new products, and absent from
--                  `products` entirely. This was the real blocker.
--   condition    — required by Meta; required by Google for
--                  used/refurbished.

-- Nullable on purpose, with dealership_name used as a fallback at
-- feed-generation time. That way a feed works immediately without
-- forcing every dealer to backfill every product first — while a
-- phone shop selling Samsung can still say "Samsung" rather than
-- being forced to claim its own shop name as the brand.
alter table products add column if not exists brand text;

-- Defaulted to 'new', which is true for essentially every SMB
-- storefront product, and stating it explicitly is required either
-- way. NOT NULL because an unstated condition is itself a feed error.
alter table products add column if not exists condition text
  not null default 'new' check (condition in ('new', 'refurbished', 'used'));

-- Conditionally required by Google when a manufacturer barcode exists.
-- Nullable and NEVER auto-generated: a wrong GTIN is worse than a
-- missing one, because it misidentifies the product against Google's
-- own catalog rather than simply omitting data.
alter table products add column if not exists gtin text;
