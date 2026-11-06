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
//
// THE ORDER BELOW IS THE ORDER THINGS RUN — but only since 2026-09-15.
// Before that the route called subsystems in its own hard-coded order,
// per business, starting with daily_autopilot, so this list decided WHICH
// subsystems ran and not WHEN. candle_by_qaaf's welcome emails went five
// days without running because four businesses' AI work came first.
// Now each subsystem runs for every business before the next starts
// (lib/automation/dailyRun.ts): sends that reach customers first, the
// AI-heavy work last.

export type SubsystemKey =
  | "daily_autopilot" | "content_autopilot" | "report_snapshots"
  | "email_automation" | "workflows" | "competitor_alerts" | "topic_alerts" | "google_reviews"
  | "budget_alerts" | "seasonal_calendar" | "churn_detection" | "cold_lead_detection"
  | "lead_scoring" | "stale_approvals" | "lead_export" | "site_audit" | "search_console_sync" | "content_performance" | "strategy_signals"
  // S5/P2. A SUBSYSTEM AND NOT A CRON ENTRY: Vercel Hobby allows
  // exactly two and both are used, which is why this file exists at
  // all. In `signals` because it reads and writes rows and calls no
  // model, so it never queues behind LLM work.
  | "decision_results"
  // S5/P5. ALSO A SUBSYSTEM AND NOT A CRON ENTRY, for the same reason,
  // and it runs on the 1st only — it decides that itself rather than
  // having a schedule of its own, because there is no third cron entry
  // to give it. In `signals` and AFTER decision_results, so the
  // outcomes measured this morning are in the review that goes out
  // this morning.
  | "monthly_review"
  // S7/P2 — the second judge: re-reads what actually went out and asks
  // the extractor about it again. In `heavy` and NOT in signals, which
  // this file's own rule settles: signals is "database-only and fast",
  // and this one calls a model.
  //
  // AND BEFORE daily_autopilot, which is the decision worth stating.
  // The owner hears about a demotion in the daily email, and
  // daily_autopilot is the subsystem that sends it — so a monitor
  // running after it would report today's escape tomorrow. It is also
  // the entry that went unreached on 4 and 5 November when the
  // dispatcher's secret went stale, and "the monitor never ran" is the
  // one state S7 must not produce quietly.
  | "output_monitor";

// TWO groups, not three: Vercel Hobby allows exactly two cron entries.
export const GROUPS: Record<string, SubsystemKey[]> = {
  // Database-only and fast, and what surfaces work waiting on a human —
  // so it runs FIRST and never queues behind LLM calls.
  // The export email first: it's the one that reaches a person.
  signals: ["lead_export", "stale_approvals", "budget_alerts", "seasonal_calendar", "churn_detection", "cold_lead_detection", "lead_scoring", "site_audit", "content_performance", "strategy_signals", "decision_results", "monthly_review"],
  // Everything slow: LLM-backed work plus third-party APIs. Emails and
  // workflow steps (a lead is waiting) and auto-posting (customers see it)
  // before monitoring and reports; daily_autopilot's per-campaign AI work
  // last, because it is what used up the budget.
  heavy: [
    "email_automation", "workflows",
    "content_autopilot",
    "google_reviews", "competitor_alerts", "topic_alerts",
    "report_snapshots",
    "output_monitor",
    "search_console_sync",
    "daily_autopilot",
  ],
};

/** Every subsystem, for a manual "run everything" invocation. */
export const ALL: SubsystemKey[] = [...GROUPS.signals, ...GROUPS.heavy];
