-- Restore EXECUTE on the knowledge-retrieval functions to
-- `authenticated`. Corrects a defect in migration 161.
--
-- WHAT WENT WRONG. 161 revoked EXECUTE on match_marketing_knowledge
-- and keyword_search_marketing_knowledge from `anon` and from
-- `public`, to stop the unauthenticated role reaching them. Revoking
-- from anon was correct. Revoking from PUBLIC was correct in intent
-- and dangerous in effect:
--
--   PostgreSQL grants EXECUTE to PUBLIC automatically when a function
--   is created. If `authenticated` held its execute rights only
--   through that default PUBLIC grant — rather than a direct grant —
--   then 161 removed Master Chat's ability to call these functions
--   along with anon's.
--
-- Whether that happened depends on this project's default privileges,
-- which is exactly the kind of thing not worth guessing about. This
-- migration grants EXECUTE explicitly, which is idempotent: harmless
-- if the right was never lost, and the fix if it was.
--
-- A DIRECT grant is also better than the inherited one regardless.
-- The previous arrangement had `authenticated` able to call these only
-- as a side effect of a default that also covered anon — the two roles
-- were coupled, which is why revoking one hit the other. After this
-- they are independent.
--
-- The revoke from anon and public STAYS. anon still cannot call these,
-- and still cannot read the underlying table (161's RLS policy covers
-- `authenticated` only).
--
-- Symptom this fixes, if it was live: Master Chat throws a permission
-- error when retrieving knowledge, or — depending on how the error
-- surfaces through retrieveKnowledge.ts's try/catch, which logs and
-- continues — silently returns no knowledge at all. The second is the
-- one to watch for, since the chat keeps working and just gets dumber.
--
-- Loop over pg_proc for the same reason 161 did: migration 094
-- re-declared both functions with a third argument, so 2-argument and
-- 3-argument overloads both exist and a named signature would cover
-- only one.

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('match_marketing_knowledge', 'keyword_search_marketing_knowledge')
  loop
    execute format('grant execute on function %s to authenticated', fn.sig);
  end loop;
end $$;

-- ================================================================
-- VERIFY AFTER RUNNING
-- ================================================================
-- select p.proname,
--        pg_get_function_identity_arguments(p.oid) as args,
--        p.proacl
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('match_marketing_knowledge','keyword_search_marketing_knowledge');
--
-- Expect every row's proacl to contain `authenticated=X/` and NOT to
-- contain `anon=X/`. An entry with an empty grantee (`=X/postgres`)
-- would mean PUBLIC still holds execute — if you see that, 161's
-- revoke did not apply and anon can still call these.
