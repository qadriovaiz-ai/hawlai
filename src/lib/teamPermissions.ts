// ------------------------------------------------------------------
// Granular team permissions — master audit Part E5.
// ------------------------------------------------------------------
// feature_scope (team_members, migration 111) is an allow-list of
// these feature-area keys, not a read/write/delete matrix — matches
// ManagerWorkspace.tsx's three existing tabs exactly, so this gates a
// real UI surface rather than an invented abstraction.
//
// Role still sets the DEFAULT scope (unchanged behavior for every
// existing member, since feature_scope is null until an owner
// explicitly narrows it); only admin/marketing_manager currently
// reach ManagerWorkspace at all, so scope is only ever meaningful for
// those two roles today.
// ------------------------------------------------------------------

export const FEATURE_AREAS = ["tasks", "leads", "team"] as const;
export type FeatureArea = (typeof FEATURE_AREAS)[number];

export const FEATURE_AREA_LABELS: Record<FeatureArea, string> = {
  tasks: "Team Tasks",
  leads: "Leads",
  team: "Team Roster",
};

const ROLE_DEFAULT_SCOPE: Record<string, FeatureArea[]> = {
  admin: ["tasks", "leads", "team"],
  marketing_manager: ["tasks", "leads", "team"],
  // Designer/content_writer/sales/viewer don't reach ManagerWorkspace
  // at all (gated by role in /api/team/workspace) — empty default is
  // correct, not a restriction they'd ever notice.
  designer: [],
  content_writer: [],
  sales: [],
  viewer: [],
};

export function resolveFeatureScope(role: string, override: string[] | null | undefined): FeatureArea[] {
  // Distinguish "no override" (null/undefined — use the role default)
  // from an explicit empty array (owner deliberately revoked every
  // area) — both are falsy-ish but mean opposite things.
  if (override != null) {
    return override.filter((a): a is FeatureArea => (FEATURE_AREAS as readonly string[]).includes(a));
  }
  return ROLE_DEFAULT_SCOPE[role] ?? [];
}
