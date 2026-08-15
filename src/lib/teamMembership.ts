// ------------------------------------------------------------------
// Shared team-membership resolver — master audit Part E5.
// ------------------------------------------------------------------
// Every team-facing surface used to resolve membership with
// `.from("team_members").eq("user_id", …).eq("status","active")
// .maybeSingle()`. PostgREST's .maybeSingle() returns data = null
// (discarding a PGRST116 error) whenever a query matches MORE than
// one row — so an agency staffer who belongs to 2+ client teams was
// silently treated as not being a team member at all: 403s from the
// team API routes, and — worse — dashboard/layout.tsx's redirect
// guard failing open, dropping them into the full owner dashboard
// where ~20 pages sit behind owner-only RLS and would render empty.
// Exactly the Agency persona the multi-business tier exists for.
//
// This is the same .maybeSingle()-on-a-multi-row-query bug class
// already fixed on the owner side (dealerships owned by one user);
// this is its team-member counterpart.
//
// Resolution order when someone is on multiple teams:
//   1. the team profiles.dealership_id currently points at — that
//      field IS the active-team pointer, written by
//      /api/agency/switch when a staffer switches client,
//   2. otherwise their first active membership, so a stale or null
//      pointer degrades to something sensible rather than a 403.
// ------------------------------------------------------------------

export interface TeamMembership {
  id: string;
  dealership_id: string;
  role: string;
  status: string;
  // null = no member-level override, use the role's default scope
  // (see src/lib/teamPermissions.ts) — non-null narrows it further.
  feature_scope: string[] | null;
}

export async function resolveActiveMembership(
  supabase: any,
  userId: string,
  opts?: { role?: string }
): Promise<TeamMembership | null> {
  const { data } = await supabase
    .from("team_members")
    .select("id, dealership_id, role, status, feature_scope")
    .eq("user_id", userId)
    .eq("status", "active");

  const active: TeamMembership[] = data ?? [];
  const candidates = opts?.role ? active.filter((m) => m.role === opts.role) : active;
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).maybeSingle();
  const pointedAt = profile?.dealership_id
    ? candidates.find((m) => m.dealership_id === profile.dealership_id)
    : undefined;
  return pointedAt ?? candidates[0];
}
