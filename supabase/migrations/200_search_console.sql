-- ============================================================
-- Google Search Console, connected by the owner (Brain, Phase 4).
--
-- WHY THIS IS THE ONE INTEGRATION THE BRAIN ACTUALLY NEEDS: Hawlai's SEO
-- work is currently guessed. The toolkit prompt asks a model for "10
-- keywords competitors are PROBABLY ranking for", and the Search
-- Opportunity Graph, the Content Opportunity Engine and every "demand
-- gap" idea in the plan are decoration on top of that guess. Search
-- Console is the owner's own real search data — the queries people
-- actually typed, the impressions and clicks they actually got — for
-- free, from a source they already have.
--
-- Same Google OAuth app as Gmail, YouTube and Ads (GOOGLE_CLIENT_ID /
-- GOOGLE_CLIENT_SECRET), one more read-only scope. No new credentials.
--
-- The plaintext columns are created but never written: tokenWrite()
-- nulls them by design and the shared tokenSelect() reads them for the
-- older providers still mid-cutover, so a missing column would break the
-- select. They exist to satisfy that shared helper and nothing else.
-- ============================================================

alter table dealerships
  add column if not exists search_console_access_token text,
  add column if not exists search_console_access_token_encrypted text,
  add column if not exists search_console_refresh_token text,
  add column if not exists search_console_refresh_token_encrypted text,
  add column if not exists search_console_token_expiry timestamptz,
  -- Which Google account authorised it, so the owner can see whose it is.
  add column if not exists search_console_email text,
  -- The verified property this business's data is read from, e.g.
  -- "sc-domain:candlebyqaaf.com" or "https://hawlai.online/site/...".
  -- Chosen at connect from the properties that account can actually see;
  -- null means connected but nothing matched, which is said plainly
  -- rather than guessed at.
  add column if not exists search_console_site_url text;

-- No RLS change: dealerships is already scoped to its owner, and these
-- are read by the server only.
