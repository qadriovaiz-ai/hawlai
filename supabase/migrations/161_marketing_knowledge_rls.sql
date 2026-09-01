-- Close cross-tenant write access to the shared RAG knowledge base.
-- Audit finding R3. HIGHEST PRIORITY — this is a live exposure.
--
-- ================================================================
-- WHY THE ORIGINAL DECISION NO LONGER HOLDS
-- ================================================================
-- Migration 090 created this table and deliberately left RLS off. Its
-- reasoning is quoted here in full so nobody reverts this file after
-- reading it:
--
--   "This table is genuinely global platform knowledge (marketing
--    frameworks, not any business's private data) — no dealership_id,
--    no RLS needed. Every business's Master Chat draws from the same
--    shared knowledge base."
--
-- That reasoning is correct about READS and wrong about WRITES, and it
-- only considered reads. There is no private data here to leak, so
-- read-exposure was never the risk. The risk is the opposite
-- direction: because every tenant's Master Chat draws from this table,
-- anyone who can WRITE to it can inject text into every other
-- business's AI context. "Shared by everyone" is precisely what makes
-- write access dangerous — it is the reason to protect the table, not
-- the reason it needed no protection.
--
-- Verified against the live database on 2026-09-02:
--   - relrowsecurity = false
--   - `anon` holds DELETE, INSERT, SELECT, REFERENCES, TRIGGER and
--     TRUNCATE
--
-- `anon` is the UNAUTHENTICATED role. Nothing in this schema stood
-- between the public internet and either inserting poisoned content
-- into every tenant's chat context, or truncating the knowledge base
-- outright.
--
-- ================================================================
-- WHY RLS ALONE IS NOT ENOUGH HERE
-- ================================================================
-- TRUNCATE IS NOT SUBJECT TO ROW LEVEL SECURITY. It is a table-level
-- operation, so enabling RLS would block anon's INSERT/UPDATE/DELETE
-- and leave TRUNCATE working. The REVOKE below is the substantive fix
-- for that specific privilege, not defence in depth.
--
-- ================================================================
-- WHAT MUST KEEP WORKING
-- ================================================================
-- Verified before writing, because a wrong answer here breaks Master
-- Chat retrieval silently rather than loudly:
--
--   - match_marketing_knowledge and keyword_search_marketing_knowledge
--     are `language sql stable` with prosecdef = false, i.e. SECURITY
--     INVOKER. They execute as the CALLER, so RLS applies to reads
--     through them. An explicit SELECT policy is therefore mandatory —
--     without one, retrieval returns empty and the chat quietly loses
--     its knowledge injection with no error.
--   - /api/master-brain uses the SESSION client → role `authenticated`
--     → needs the SELECT policy and grant below.
--   - /api/webhooks/whatsapp and /api/public/chat use the SERVICE
--     client → service_role bypasses RLS → unaffected.
--   - /api/admin/seed-knowledge (the only writer) uses the SERVICE
--     client → unaffected by the revokes below. It stays guarded by
--     ADMIN_SEED_SECRET.
--
-- `anon` therefore needs NOTHING on this table. No anon-key code path
-- reads it: public chat uses the service client.
--
-- RLS on an existing table, so no CREATE TABLE / policy pairing rule
-- applies — this file IS the policy set for a table that had none.

alter table marketing_knowledge enable row level security;

-- Read: any signed-in user, every tenant. This is the shared knowledge
-- base working exactly as migration 090 intended.
drop policy if exists "marketing_knowledge_read" on marketing_knowledge;
create policy "marketing_knowledge_read" on marketing_knowledge
  for select
  to authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policy is created, deliberately. Under RLS,
-- an operation with no permissive policy is denied — so writes are
-- closed to every role that RLS applies to. service_role BYPASSES RLS
-- entirely and keeps full access, which is what the seeding endpoint
-- uses. Adding a write policy for service_role would be dead code and
-- would imply RLS was what permitted it.

-- Grants. RLS governs rows; these govern whether the role may attempt
-- the operation at all, and TRUNCATE is only reachable here.
revoke all privileges on table marketing_knowledge from anon;

-- Authenticated keeps read only. The write privileges are removed even
-- though RLS already denies them, so the grant table stops implying a
-- capability that does not exist.
revoke insert, update, delete, truncate, references, trigger
  on table marketing_knowledge from authenticated;
grant select on table marketing_knowledge to authenticated;

-- PUBLIC is revoked too: anon inherits anything granted to PUBLIC, so
-- revoking from anon alone would not close the hole if the original
-- grant was made this way. Safe for service_role and the table owner,
-- both of which hold privileges directly rather than through PUBLIC.
revoke all privileges on table marketing_knowledge from public;

-- The retrieval functions are SECURITY INVOKER, so anon calling them
-- would now fail on the underlying table anyway. Execute is revoked as
-- well so the failure is "not permitted to call" rather than an error
-- surfaced from inside a function anon should never reach.
--
-- Done as a loop over pg_proc rather than named signatures, because
-- these functions have MULTIPLE OVERLOADS. Migration 094 re-declared
-- both with a third argument (filter_categories text[]); `create or
-- replace function` with a changed signature creates a new overload
-- instead of replacing, so the 2-argument versions from 090 and 092
-- are still present alongside the 3-argument ones. Naming a single
-- signature would revoke on one overload and silently leave the other
-- callable — and naming one that does not exist would abort this
-- entire migration. This covers whatever is actually there.
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
    execute format('revoke execute on function %s from anon', fn.sig);
    execute format('revoke execute on function %s from public', fn.sig);
  end loop;
end $$;

-- ================================================================
-- VERIFY AFTER RUNNING — expected results in comments
-- ================================================================
-- select relrowsecurity from pg_class
--   where oid = 'public.marketing_knowledge'::regclass;
--   -> t
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and table_name='marketing_knowledge'
--   order by grantee, privilege_type;
--   -> no rows for anon or PUBLIC; authenticated shows SELECT only
--
-- select policyname, cmd, roles from pg_policies
--   where schemaname='public' and tablename='marketing_knowledge';
--   -> one row: marketing_knowledge_read / SELECT / {authenticated}
--
-- Then confirm retrieval still works: open Master Chat and ask
-- something the knowledge base covers. Empty results with no error is
-- the failure mode to watch for.
