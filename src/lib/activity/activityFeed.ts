// ------------------------------------------------------------------
// Unified Activity Feed — UX Transformation, Piece 1.
// ------------------------------------------------------------------
// Answers "what has Hawlai actually done?" by composing five existing
// stores into one chronological timeline:
//   audit_log          — approvals, AI call actions, auto-pauses, merges
//   automation_run_log — the 14 daily cron subsystems
//   agent_tasks        — queued/running/completed AI work
//   calls              — AI phone calls
//   notifications      — proactive alerts already surfaced elsewhere
//
// NO SCHEMA. Verified all five tables carry dealership_id + created_at
// and enough descriptive content to normalize. A materialized view
// could come later if data volume demands it; at current volumes this
// is five indexed reads.
//
// THE TRANSLATION LAYER IS THE REAL WORK, not the merge. Raw values in
// these tables are internal: "cron:daily_autopilot",
// "vapi_call_tool:log_complaint", "content_autopilot",
// "event_bus_dispatched". Rendering those directly would violate the
// product rule that customers never see provider or internal
// architecture naming. So every source value is mapped to business
// language, and anything unrecognized is DROPPED rather than shown raw
// — an unmapped internal string leaking into the customer's timeline
// is worse than a slightly shorter timeline.
//
// Deliberately excluded: event_bus_dispatched and tool_call_failed
// (pure internal plumbing — a customer has no use for "the event bus
// dispatched an event"), and every automation subsystem that produces
// no user-visible outcome on its own.
// ------------------------------------------------------------------

export type ActivityStatus = "done" | "in_progress" | "scheduled" | "failed" | "needs_you";

export interface ActivityItem {
  id: string;
  at: string; // ISO
  title: string;
  detail: string | null;
  status: ActivityStatus;
  href: string | null;
  /** Semantic key the UI maps to an icon — keeps this file free of UI imports. */
  kind: "call" | "lead" | "campaign" | "content" | "research" | "approval" | "privacy" | "alert" | "work";
}

// ---- audit_log ----------------------------------------------------

const AUDIT_LABELS: Record<string, { title: string; kind: ActivityItem["kind"]; href: string | null }> = {
  call_tool_executed: { title: "Action taken during a call", kind: "call", href: "/dashboard/calls" },
  campaign_auto_paused: { title: "Campaign paused automatically", kind: "campaign", href: "/dashboard/ads/campaigns" },
  lead_auto_merged: { title: "Duplicate customer records merged", kind: "lead", href: "/dashboard/leads-hub" },
  lead_converted: { title: "Lead converted", kind: "lead", href: "/dashboard/leads-hub" },
  task_completed: { title: "Work completed", kind: "work", href: "/dashboard/tasks" },
  task_failed: { title: "Work couldn't be completed", kind: "work", href: "/dashboard/tasks" },
  personal_data_exported: { title: "Customer data exported", kind: "privacy", href: null },
  personal_data_erased: { title: "Customer data erased", kind: "privacy", href: null },
  // Deliberately absent: event_bus_dispatched, tool_call_failed —
  // internal plumbing with no customer meaning.
};

// ---- automation_run_log -------------------------------------------

// Only subsystems whose work a business owner would recognize as
// something happening on their behalf. Ones that are pure internal
// bookkeeping (daily_autopilot itself, which is the wrapper around the
// others) are omitted so the feed doesn't double-report.
const SUBSYSTEM_LABELS: Record<string, { title: string; kind: ActivityItem["kind"]; href: string | null }> = {
  budget_alerts: { title: "Checked campaign budgets", kind: "campaign", href: "/dashboard/ads/campaigns" },
  churn_detection: { title: "Checked for customers at risk of leaving", kind: "lead", href: "/dashboard/retention" },
  cold_lead_detection: { title: "Checked for leads going cold", kind: "lead", href: "/dashboard/leads-hub" },
  competitor_alerts: { title: "Checked competitors for new activity", kind: "research", href: "/dashboard/competitor-intel" },
  content_autopilot: { title: "Prepared content", kind: "content", href: "/dashboard/calendar" },
  email_automation: { title: "Ran email follow-ups", kind: "content", href: "/dashboard/email" },
  google_reviews: { title: "Checked new Google reviews", kind: "alert", href: "/dashboard/insights" },
  lead_scoring: { title: "Scored new leads", kind: "lead", href: "/dashboard/leads-hub" },
  report_snapshots: { title: "Updated performance reports", kind: "campaign", href: "/dashboard/analytics" },
  seasonal_calendar: { title: "Updated the seasonal calendar", kind: "content", href: "/dashboard/calendar" },
  stale_approvals: { title: "Checked for approvals waiting too long", kind: "approval", href: "/dashboard/approvals" },
  topic_alerts: { title: "Checked topics you're watching", kind: "research", href: "/dashboard/research" },
  workflows: { title: "Ran automation workflows", kind: "work", href: "/dashboard/marketing-automation" },
};

// ---- agent_tasks --------------------------------------------------

const AGENT_TASK_LABELS: Record<string, { title: string; kind: ActivityItem["kind"]; href: string | null }> = {
  generate_content: { title: "Writing content", kind: "content", href: "/dashboard/content-marketing" },
  activate_ad_campaign: { title: "Activating a campaign", kind: "campaign", href: "/dashboard/ads/campaigns" },
  change_campaign_budget: { title: "Changing a campaign budget", kind: "campaign", href: "/dashboard/ads/campaigns" },
  change_campaign_targeting: { title: "Changing campaign targeting", kind: "campaign", href: "/dashboard/ads/campaigns" },
  auto_paused_campaign: { title: "Pausing a campaign", kind: "campaign", href: "/dashboard/ads/campaigns" },
};

const AGENT_TASK_STATUS: Record<string, ActivityStatus> = {
  pending: "scheduled",
  processing: "in_progress",
  done: "done",
  failed: "failed",
  cancelled: "done",
};

// ---- row shapes (only the columns actually read) -------------------

interface AuditRow { id: string; event_type: string; summary: string; created_at: string }
interface AutomationRow { id: string; subsystem: string; success: boolean; detail: string | null; created_at: string }
interface AgentTaskRow { id: string; action_type: string; title: string; status: string; error: string | null; scheduled_for: string; completed_at: string | null; created_at: string }
interface CallRow { id: string; status: string; summary: string | null; direction: string | null; created_at: string; leads?: { name: string } | { name: string }[] | null }
interface NotificationRow { id: string; kind: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }
interface ApprovalRow { id: string; action_type: string; amount: number | string | null; created_at: string }

export interface ActivitySources {
  audit?: AuditRow[] | null;
  automation?: AutomationRow[] | null;
  agentTasks?: AgentTaskRow[] | null;
  calls?: CallRow[] | null;
  notifications?: NotificationRow[] | null;
  approvals?: ApprovalRow[] | null;
}

// Pending approvals are read DIRECTLY rather than inferred from
// notifications: an approval is the single most important thing that
// can be waiting on someone, and depending on a notification row
// having been emitted would make "Waiting for You" silently wrong if
// that best-effort emit ever failed.
const APPROVAL_LABELS: Record<string, string> = {
  activate_ad_campaign: "Approve activating a campaign",
  change_campaign_budget: "Approve a campaign budget change",
  change_campaign_targeting: "Approve a campaign targeting change",
  launch_campaign: "Approve launching a campaign",
  increase_budget: "Approve a budget increase",
  pause_campaign: "Approve pausing a campaign",
};

/** Supabase returns an embedded to-one relation as an object or a single-element array depending on the query shape. */
function leadName(lead: CallRow["leads"]): string | null {
  if (!lead) return null;
  const row = Array.isArray(lead) ? lead[0] : lead;
  return row?.name ?? null;
}

export function buildActivityFeed(sources: ActivitySources, limit = 50): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const row of sources.audit ?? []) {
    const label = AUDIT_LABELS[row.event_type];
    if (!label) continue; // unmapped internal event — drop, never render raw
    items.push({
      id: `audit:${row.id}`,
      at: row.created_at,
      title: label.title,
      // audit_log.summary is already written as one human-readable
      // line by its producers, so it's safe to surface directly.
      detail: row.summary,
      status: row.event_type === "task_failed" ? "failed" : "done",
      href: label.href,
      kind: label.kind,
    });
  }

  for (const row of sources.automation ?? []) {
    const label = SUBSYSTEM_LABELS[row.subsystem];
    if (!label) continue;
    // Successful routine checks that found nothing are noise — a
    // timeline full of "checked competitors, found nothing" trains
    // people to ignore it. Keep successes only when there's a real
    // detail to show, and always keep failures.
    if (row.success && !row.detail) continue;
    items.push({
      id: `automation:${row.id}`,
      at: row.created_at,
      title: label.title,
      detail: row.success ? row.detail : "Couldn't complete this — it'll be retried on the next run.",
      status: row.success ? "done" : "failed",
      href: label.href,
      kind: label.kind,
    });
  }

  for (const row of sources.agentTasks ?? []) {
    const label = AGENT_TASK_LABELS[row.action_type];
    items.push({
      id: `task:${row.id}`,
      // A scheduled task's meaningful time is when it will run;
      // a finished one's is when it finished.
      at: row.completed_at ?? (row.status === "pending" ? row.scheduled_for : row.created_at),
      title: label?.title ?? row.title, // agent_tasks.title is already human-written
      detail: row.status === "failed" ? "Couldn't complete this." : null,
      status: AGENT_TASK_STATUS[row.status] ?? "done",
      href: label?.href ?? "/dashboard/tasks",
      kind: label?.kind ?? "work",
    });
  }

  for (const row of sources.calls ?? []) {
    const name = leadName(row.leads);
    const inbound = row.direction === "inbound";
    const connected = row.status === "completed";
    items.push({
      id: `call:${row.id}`,
      at: row.created_at,
      title: inbound
        ? `Answered a call${name ? ` from ${name}` : ""}`
        : `Called ${name ?? "a lead"}`,
      detail: connected ? row.summary : `No answer — ${row.status.replace(/_/g, " ")}`,
      status: connected ? "done" : "failed",
      href: "/dashboard/calls",
      kind: "call",
    });
  }

  for (const row of sources.notifications ?? []) {
    // approval_pending notifications are skipped — approvals come from
    // pending_approvals below, which is authoritative. Keeping both
    // would show the same pending approval twice.
    if (row.kind === "approval_pending") continue;
    items.push({
      id: `notification:${row.id}`,
      at: row.created_at,
      title: row.title,
      detail: row.body,
      // An unread notification is genuinely something waiting on the
      // person, which is what "needs_you" means to the Work page.
      status: row.read_at ? "done" : "needs_you",
      href: row.href,
      kind: "alert",
    });
  }

  for (const row of sources.approvals ?? []) {
    const amount = Number(row.amount);
    items.push({
      id: `approval:${row.id}`,
      at: row.created_at,
      title: APPROVAL_LABELS[row.action_type] ?? "Approve an action",
      detail: Number.isFinite(amount) && amount > 0 ? `₹${Math.round(amount).toLocaleString("en-IN")}` : null,
      status: "needs_you",
      href: "/dashboard/approvals",
      kind: "approval",
    });
  }

  const byNewest = (a: ActivityItem, b: ActivityItem) => new Date(b.at).getTime() - new Date(a.at).getTime();

  // Live items (needs-you, in-progress, scheduled) are never dropped by
  // the limit. Sorting purely by date would push a three-week-old
  // pending approval past the slice — precisely the item that most
  // needs surfacing. The limit therefore applies only to the historical
  // tail, which is the part that's genuinely safe to truncate.
  const live = items.filter((i) => i.status === "needs_you" || i.status === "in_progress" || i.status === "scheduled").sort(byNewest);
  const past = items.filter((i) => i.status === "done" || i.status === "failed").sort(byNewest);

  return [...live, ...past.slice(0, Math.max(0, limit - live.length))];
}

/** Groups a feed into the four Work-page buckets. Kept here so Work and Home can't disagree about what "now" means. */
export function groupActivity(items: ActivityItem[]) {
  const now = Date.now();
  return {
    now: items.filter((i) => i.status === "in_progress"),
    needsYou: items.filter((i) => i.status === "needs_you"),
    scheduled: items.filter((i) => i.status === "scheduled" && new Date(i.at).getTime() > now),
    completed: items.filter((i) => i.status === "done" || i.status === "failed"),
  };
}
