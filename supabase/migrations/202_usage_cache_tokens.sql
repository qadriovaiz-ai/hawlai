-- ============================================================
-- What prompt caching actually saved (cost fixes, Fix 1A).
--
-- The chat re-sent ~10,900 tokens of tool definitions on every iteration
-- and every turn. With a cache breakpoint on the tool block, Anthropic
-- reports two more numbers on each reply: how many tokens were written
-- into the cache, and how many were read back from it. Without columns
-- for them, cost_inr would keep pricing cache reads at the full input
-- rate and overstate the bill by roughly the amount the change saves —
-- which would make the fix look like it did nothing.
--
-- Cache writes cost 1.25x the input rate, reads 0.1x. Both are recorded
-- as counted, so a week of real traffic settles what caching is worth
-- rather than an estimate.
--
-- Additive and nullable: every row written before this stays valid, and
-- a non-cached call simply leaves them null.
-- ============================================================

alter table api_usage_logs
  add column if not exists cache_creation_input_tokens integer,
  add column if not exists cache_read_input_tokens integer;

-- No RLS change: the table stays read-only to clients and is written by
-- the server through the service role (see lib/usage/logUsage.ts).
