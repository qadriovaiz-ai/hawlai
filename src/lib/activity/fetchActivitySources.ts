// Shared fetch for the five activity stores.
//
// Extracted from /api/activity so the Dashboard can render the same
// timeline server-side without a second copy of these six queries. The
// queries are load-bearing in ways that aren't obvious from reading
// them — the service-role client for owner-only tables, and approvals
// deliberately not date-filtered — so duplicating them was the real
// risk here, not the line count.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivitySources } from "./activityFeed";

export interface FetchedActivity {
  sources: ActivitySources;
  /** How many stores failed. Lets the UI say a timeline is partial rather than quietly short. */
  failedSources: number;
}

/** Far enough back to fill a timeline without scanning all history. */
const LOOKBACK_DAYS = 14;

export async function fetchActivitySources(
  supabase: SupabaseClient,
  service: SupabaseClient,
  dealershipId: string,
  limit = 50
): Promise<FetchedActivity> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // allSettled, not all: five independent sources, and one failing
  // shouldn't blank the whole timeline — a partial feed is far more
  // useful than an error page.
  const results = await Promise.allSettled([
    // audit_log and automation_run_log are owner-only under RLS, which
    // would return nothing for a team member. Service-role, scoped to a
    // dealershipId the caller's own session already proved.
    service
      .from("audit_log")
      .select("id, event_type, summary, created_at")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    service
      .from("automation_run_log")
      .select("id, subsystem, success, detail, created_at")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    service
      .from("agent_tasks")
      .select("id, action_type, title, status, error, scheduled_for, completed_at, created_at")
      .eq("dealership_id", dealershipId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("calls")
      .select("id, status, summary, direction, created_at, leads(name)")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id, kind, title, body, href, read_at, created_at")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    // Deliberately NOT date-filtered: an approval waiting three weeks
    // is exactly the one that most needs surfacing, so `since` would
    // hide the worst case.
    service
      .from("pending_approvals")
      .select("id, action_type, amount, created_at")
      .eq("dealership_id", dealershipId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const [auditRes, automationRes, tasksRes, callsRes, notificationsRes, approvalsRes] = results;
  const unwrap = <T,>(r: PromiseSettledResult<any>): T[] =>
    r.status === "fulfilled" && !r.value.error ? (r.value.data ?? []) : [];

  return {
    sources: {
      audit: unwrap(auditRes),
      automation: unwrap(automationRes),
      agentTasks: unwrap(tasksRes),
      calls: unwrap(callsRes),
      notifications: unwrap(notificationsRes),
      approvals: unwrap(approvalsRes),
    },
    failedSources: results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error)).length,
  };
}
