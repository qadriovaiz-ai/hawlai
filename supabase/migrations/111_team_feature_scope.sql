-- ============================================================
-- Master audit Part E5 — granular per-business team permissions.
--
-- Extends team_members rather than adding a new table: a permission
-- set only ever exists in the context of one (dealership_id, user_id)
-- pair, which is exactly one team_members row already (per-business
-- scoping was already solved — one row per business per member).
--
-- feature_scope is an allow-list of feature-area keys ("tasks",
-- "leads", "team" — matching ManagerWorkspace's three existing tabs
-- exactly), not a read/write/delete permissions matrix. null means
-- "use the role's default scope" (current behavior, unchanged for
-- every existing member); non-null narrows it further for that one
-- member. Only meaningful today for admin/marketing_manager, the only
-- roles that reach ManagerWorkspace at all.
-- ============================================================

alter table team_members add column if not exists feature_scope text[];
