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
  | "output_monitor"
  // S7/P6 — looks at the approval history and, when an action has
  // earned it, raises ONE card asking whether it may run unattended.
  // Model-free and read-only apart from that card, so it belongs in
  // `signals` with the other database-only work.
  //
  // AFTER output_monitor IS NOT POSSIBLE — that one is in `heavy`,
  // which runs second. So a card raised this morning rests on
  // yesterday's verdicts, which is the honest ordering anyway: evidence
  // that has been checked, rather than evidence from an hour ago.
  | "autonomy_review"
  // G4 — page speed, measured. In `heavy` and NOT in signals, which this
  // file's own rule settles twice over: signals is "database-only and
  // fast", and this one calls a third-party API over the network.
  //
  // MONTHLY, AND IT DECIDES THAT ITSELF, the same way monthly_review
  // does and for the same reason — there is no third cron entry to give
  // it. A page's weight does not change daily.
  //
  // OFF BY DEFAULT. PAGESPEED_ENABLED gates it (the founder's decision,
  // 7 November 2026): with no real business on the platform, a monthly
  // run spends quota and attention on test data.
  | "page_speed"
  // A5 — the AEO check, on a schedule. In `heavy`, and THE PLAN SAID
  // `signals`: that was wrong and this file's own rule settles it.
  // signals is "database-only and fast"; this one calls a model WITH
  // LIVE WEB SEARCH. In signals it would put an LLM call in front of the
  // export email and the stale-approval sweep — the exact fault the
  // header of this file records, where Social Media Auto-Posting read
  // "100% success" because it ran behind work that used the 60 seconds.
  //
  // MONTHLY, AND IT DECIDES THAT ITSELF — there is no third cron entry,
  // the same constraint monthly_review and page_speed work around.
  //
  // OFF BY DEFAULT. AEO_SCHEDULE_ENABLED gates it, for the reason G4's
  // flag exists: each run is four live web searches per business, and
  // there is no real business yet whose trend would mean anything.
  //
  // BEFORE daily_autopilot, and the first attempt had this backwards.
  // The reasoning was "nothing reads this, so if the 60 seconds run out
  // it is the right thing to lose". But put after daily_autopilot it
  // would not lose gracefully — IT WOULD NEVER RUN. On the one day a
  // month it does any work, every business's per-campaign AI work would
  // already have spent the budget, and the run that never happened looks
  // identical to the month the business was simply not named. That is
  // the exact fault this file's header records about Social Media
  // Auto-Posting reading "100% success".
  //
  // tests/dailyJobs.test.ts caught it: it pins daily_autopilot as the
  // last entry, which is a decision with an incident behind it.
  // Corrected 7 November 2026.
  | "aeo_schedule"
  // G5's Maps leg — reads this business's Google listing and stores what
  // it says (migration 225). In `heavy` for the usual reason: signals is
  // "database-only and fast" and this is a third-party network call.
  //
  // THE COMPARISON IS NOT HERE. It is three strings against three
  // strings, costs nothing, and runs daily inside site_audit in the
  // signals group. Only the FETCH is monthly, which is the whole point
  // of storing a snapshot — the same split search_console_sync uses.
  //
  // NOT FLAGGED, unlike page_speed and aeo_schedule, and the difference
  // is real: those spend on every run, while this is free for the first
  // 1,000 requests a month and skips entirely for a business with no
  // listing connected — which is every business today.
  | "place_snapshot";

// TWO groups, not three: Vercel Hobby allows exactly two cron entries.
export const GROUPS: Record<string, SubsystemKey[]> = {
  // Database-only and fast, and what surfaces work waiting on a human —
  // so it runs FIRST and never queues behind LLM calls.
  // The export email first: it's the one that reaches a person.
  signals: ["lead_export", "stale_approvals", "budget_alerts", "seasonal_calendar", "churn_detection", "cold_lead_detection", "lead_scoring", "site_audit", "content_performance", "strategy_signals", "decision_results", "monthly_review", "autonomy_review"],
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
    // After search_console_sync, so if a run is cut short the searches
    // are already in — they are what every other piece reads.
    "page_speed",
    // A5, beside page_speed: both monthly, both flagged off, both a
    // third party over the network. BEFORE daily_autopilot, like
    // everything else here.
    "aeo_schedule",
    // G5's Maps leg, beside the other monthly third-party work and
    // BEFORE daily_autopilot, like everything else in this group.
    "place_snapshot",
    "daily_autopilot",
  ],
};

/** Every subsystem, for a manual "run everything" invocation. */
export const ALL: SubsystemKey[] = [...GROUPS.signals, ...GROUPS.heavy];
