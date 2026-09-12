// Which subsystems each daily cron invocation runs, and in what order.
//
// Lives outside the route file because Next.js only allows a fixed set
// of exports from a route (GET, POST, maxDuration…), and the order below
// is a decision worth testing by running it, not by reading source.
//
// ORDER IS BUDGET. This project is on Vercel Hobby: each invocation gets
// 60 seconds, and a function killed at the limit writes NOTHING for the
// subsystems it never reached — no failure row, no log line. The health
// panel then shows only the runs that got far enough to record
// themselves, which reads as a perfect success rate.
//
// That is how Social Media Auto-Posting could show "100% success" while
// one post reached Facebook in 28 days: it ran AFTER daily_autopilot,
// which spends much of the budget on LLM calls for every business.
// It now runs first — it is the one heavy subsystem whose output is
// public, and the one where silently not running is most visible to the
// business's own customers.

export type SubsystemKey =
  | "daily_autopilot" | "content_autopilot" | "report_snapshots"
  | "email_automation" | "workflows" | "competitor_alerts" | "topic_alerts" | "google_reviews"
  | "budget_alerts" | "seasonal_calendar" | "churn_detection" | "cold_lead_detection"
  | "lead_scoring" | "stale_approvals";

// TWO groups, not three: Vercel Hobby allows exactly two cron entries.
export const GROUPS: Record<string, SubsystemKey[]> = {
  // Database-only and fast, and what surfaces work waiting on a human —
  // so it runs FIRST and never queues behind LLM calls.
  signals: ["budget_alerts", "seasonal_calendar", "churn_detection", "cold_lead_detection", "lead_scoring", "stale_approvals"],
  // Everything slow: LLM-backed work plus third-party APIs.
  heavy: [
    "content_autopilot",
    "daily_autopilot", "report_snapshots",
    "email_automation", "workflows", "competitor_alerts", "topic_alerts", "google_reviews",
  ],
};

/** Every subsystem, for a manual "run everything" invocation. */
export const ALL: SubsystemKey[] = [...GROUPS.signals, ...GROUPS.heavy];
