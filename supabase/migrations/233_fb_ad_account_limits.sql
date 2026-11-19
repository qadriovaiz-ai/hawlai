-- The ad account's own limits, as Meta reports them.
--
-- ─────────────────────────────────────────────────────────────────────
-- THIS MIGRATION RECORDS WHAT PRODUCTION ALREADY HAS. IT IS NOT NEW
-- ─────────────────────────────────────────────────────────────────────
--
-- Found 19 November 2026 while planning the ads work: `adAccountLimits.ts`
-- SELECTs four columns that NO migration in this repository creates.
-- `LIMITS_SELECT` names them —
--
--   fb_min_daily_budget, fb_currency, fb_account_status, fb_limits_checked_at
--
-- — and `/api/ads/preview` and the adlaunch account check both read
-- them. A grep of all 228 migration files for `min_daily_budget`,
-- `account_status` and `limits_checked` returned nothing.
--
-- That left two possibilities, and they are very different: either the
-- columns were added to production by hand and only the FILE is missing,
-- or they do not exist and both routes have been failing in production —
-- PostgREST rejects an entire SELECT when one column is missing, so this
-- would not degrade, it would 500.
--
-- Settled by querying production's information_schema on 19 November
-- 2026: all five columns exist, with the types written below. So only
-- the file was missing, and this is that file.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHICH IS WHY EVERY STATEMENT HERE IS A NO-OP ON PRODUCTION
-- ─────────────────────────────────────────────────────────────────────
--
-- `add column if not exists`, with the types read back from
-- information_schema rather than guessed from the TypeScript. Running
-- this against production changes nothing and is safe; running it
-- against a fresh database gives that database what production has.
--
-- The point is not to change production. It is that `supabase/migrations/`
-- is supposed to be the source of truth for the schema, and for these
-- four columns it silently was not — so a new environment built from
-- this repository would have had two broken ad routes and no clue why.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHAT EACH ONE IS
-- ─────────────────────────────────────────────────────────────────────
--
-- fb_min_daily_budget   Meta's OWN minimum for this account, in minor
--                       units of its own currency. Read live and never
--                       hard-coded: the floor differs by currency, by
--                       objective and by account, and a number written
--                       into code is wrong for somebody on day one.
--
-- fb_currency           The ad account's currency. Pairs with the
--                       budget above — a minor-unit integer means
--                       nothing without it.
--
-- fb_account_status     Meta's account_status code. 1 is usable; 2 is
--                       disabled; 3 is an unsettled balance. Stored as
--                       the integer Meta returns, NOT as a boolean,
--                       because "why can't I advertise" needs the
--                       reason and not just the refusal.
--
-- fb_limits_checked_at  When the three above were last read from Meta.
--                       The cache is seven days (LIMITS_TTL_MS) and
--                       staleness is computed from this column; NULL
--                       means never read, which reads as stale and
--                       triggers a fetch rather than being treated as
--                       fresh.
--
-- fb_ad_account_id already has a migration (it is the one column of the
-- five that does). It is listed in the verify query below so the whole
-- set can be confirmed in one go.

alter table dealerships
  add column if not exists fb_min_daily_budget integer;

alter table dealerships
  add column if not exists fb_currency text;

alter table dealerships
  add column if not exists fb_account_status integer;

alter table dealerships
  add column if not exists fb_limits_checked_at timestamptz;

comment on column dealerships.fb_min_daily_budget is
  'Meta''s own minimum daily budget for this ad account, in minor units of fb_currency. Read live from the account and cached for seven days — never hard-coded, because the floor differs by currency, objective and account.';

comment on column dealerships.fb_account_status is
  'Meta''s account_status code as returned: 1 usable, 2 disabled, 3 unsettled balance. Kept as the integer rather than a boolean so the owner can be told WHY the account cannot advertise, not merely that it cannot.';

comment on column dealerships.fb_limits_checked_at is
  'When the limits above were last read from Meta. NULL means never read, which counts as stale and triggers a fetch — it is not treated as fresh.';

-- VERIFY. Expected: exactly these five rows, in this order.
--
--   fb_account_status     | integer
--   fb_ad_account_id      | text
--   fb_currency           | text
--   fb_limits_checked_at  | timestamp with time zone
--   fb_min_daily_budget   | integer
--
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'dealerships'
--   and column_name in (
--     'fb_ad_account_id', 'fb_min_daily_budget', 'fb_currency',
--     'fb_account_status', 'fb_limits_checked_at'
--   )
-- order by column_name;
--
-- AND nothing was overwritten. Expected: the same count as before this
-- ran — every account that had a cached reading still has it.
--
-- select count(*) from dealerships where fb_limits_checked_at is not null;
