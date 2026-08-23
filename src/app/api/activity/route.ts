import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { buildActivityFeed, groupActivity } from "@/lib/activity/activityFeed";

// UX Transformation, Piece 1 — the unified activity timeline.
//
// Reads five existing stores and normalizes them. No schema, no new
// tracking: everything here was already being recorded, it just had no
// combined view.

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const grouped = searchParams.get("grouped") === "1";

  // Look back far enough to fill a timeline without scanning history.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // automation_run_log and audit_log are owner-only RLS, which would
  // return nothing for a team member. Service-role, scoped to the
  // dealershipId already resolved from the caller's own session —
  // the same pattern used throughout this codebase for these tables.
  const service = createServiceClient();

  // allSettled, not all: five independent sources, and one failing
  // shouldn't blank the whole timeline — a partial feed is far more
  // useful than an error page.
  const [auditRes, automationRes, tasksRes, callsRes, notificationsRes] = await Promise.allSettled([
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
  ]);

  const unwrap = <T,>(r: PromiseSettledResult<any>): T[] =>
    r.status === "fulfilled" && !r.value.error ? (r.value.data ?? []) : [];

  const items = buildActivityFeed(
    {
      audit: unwrap(auditRes),
      automation: unwrap(automationRes),
      agentTasks: unwrap(tasksRes),
      calls: unwrap(callsRes),
      notifications: unwrap(notificationsRes),
    },
    limit
  );

  // Reported so a partial timeline is visibly partial rather than
  // silently short — the UI can say "some activity couldn't be loaded".
  const failedSources = [auditRes, automationRes, tasksRes, callsRes, notificationsRes].filter(
    (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error)
  ).length;

  return NextResponse.json({
    items,
    ...(grouped ? { grouped: groupActivity(items) } : {}),
    partial: failedSources > 0,
  });
}
