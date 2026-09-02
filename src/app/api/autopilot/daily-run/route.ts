import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runDailyAutopilot } from "@/lib/agents/autopilotAgent";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { runWorkflows } from "@/lib/automation/workflowEngine";
import { checkCompetitorAlerts } from "@/lib/automation/competitorMonitor";
import { checkTopicAlerts } from "@/lib/automation/topicMonitor";
import { runReportSnapshots } from "@/lib/automation/reportSnapshot";
import { runContentAutopilot } from "@/lib/automation/contentAutopilot";
import { fetchGoogleReviewsSnapshot } from "@/lib/agents/reputationAgent";
import { syncSeasonalCalendarEntries } from "@/lib/agents/seasonalityAgent";
import { notifyAtRiskCustomers } from "@/lib/agents/churnAgent";
import { notifyColdLeads } from "@/lib/agents/coldLeadAgent";
import { checkCampaignBudgets } from "@/lib/agents/budgetAlertAgent";
import { scoreActiveLeads } from "@/lib/agents/leadScoringAgent";
import { checkStalePendingApprovals } from "@/lib/automation/staleApprovalDetection";
import { runAndLog } from "@/lib/automation/runAndLog";
import { checkPlatformDailySpend } from "@/lib/agents/platformSpendAlertAgent";

// Triggered by Vercel Cron once a day (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
// is set as an env var — we check for it here. If CRON_SECRET isn't
// set yet, the route still works (useful while testing) but logs a
// warning, since it'd otherwise be publicly triggerable.
// ------------------------------------------------------------------
// SUBSYSTEM GROUPS — audit item R7.
// ------------------------------------------------------------------
// All fifteen subsystems used to run in ONE invocation, sequentially,
// for every dealership. A timeout partway through silently skipped
// every later subsystem for every remaining tenant, and the run still
// reported success for whatever it had managed.
//
// Worse, and only found while fixing this: THIS ROUTE NEVER SET
// maxDuration. Other long routes in this codebase set 300 explicitly;
// this one ran on the platform default, which is far shorter than a
// loop containing several LLM calls per dealership needs. The
// "timeout partway through" in the audit finding was not hypothetical
// — it was the likely steady state.
//
// Split by COST rather than per-dealership fan-out. Fan-out needs a
// queue or self-invocation, which is a lot of machinery for eight
// tenants, and it would not help the case that actually hurts: one
// tenant with enough data to exhaust a single budget. Grouping gives
// the slow work its own budget so it cannot starve the fast work,
// which is what the finding is about.
type SubsystemKey =
  | "daily_autopilot" | "content_autopilot" | "report_snapshots"
  | "email_automation" | "workflows" | "competitor_alerts" | "topic_alerts" | "google_reviews"
  | "budget_alerts" | "seasonal_calendar" | "churn_detection" | "cold_lead_detection"
  | "lead_scoring" | "stale_approvals";

// TWO groups, not three: this project is on Vercel Hobby, which allows
// exactly two cron entries. The slow work (LLM-backed and third-party
// APIs) is merged into one group rather than dropping a group
// entirely, so nothing stops running.
const GROUPS: Record<string, SubsystemKey[]> = {
  // Database-only and fast, and what surfaces work waiting on a human
  // — so it runs FIRST and never queues behind LLM calls.
  signals: ["budget_alerts", "seasonal_calendar", "churn_detection", "cold_lead_detection", "lead_scoring", "stale_approvals"],
  // Everything slow: LLM-backed work plus third-party APIs.
  heavy: [
    "daily_autopilot", "content_autopilot", "report_snapshots",
    "email_automation", "workflows", "competitor_alerts", "topic_alerts", "google_reviews",
  ],
};

/** Every subsystem, for a manual "run everything" invocation. */
const ALL: SubsystemKey[] = [...GROUPS.signals, ...GROUPS.heavy];

// 60, not the 300 used by other long routes here: Vercel Hobby caps
// function duration at 60 seconds. Setting 300 would be aspirational
// at best and a rejected deployment at worst.
//
// WORTH KNOWING, not fixed here: several existing routes in this
// codebase (master-brain, website-builder, 3d-scenes, the whatsapp
// webhook) declare maxDuration = 300 while on a plan that caps at 60.
// They are either being silently capped or would fail on a config
// change — recorded rather than changed, since altering them is
// outside this item.
//
// CONSEQUENCE FOR THE HEAVY GROUP, stated plainly: eight dealerships
// times three LLM-backed subsystems will not reliably finish inside 60
// seconds. The partial-run detection below is what makes that visible
// instead of silent, and per-dealership batching with a cursor is the
// real fix if it proves to be a problem.
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get("secret");
    const isAuthorized = authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[autopilot] CRON_SECRET is not set — this endpoint is currently unprotected.");
  }

  // Which slice of the work this invocation is responsible for.
  // Absent = everything, so a manual call still runs the full set.
  const groupParam = new URL(request.url).searchParams.get("group");
  const subsystems = groupParam ? GROUPS[groupParam] : ALL;
  if (!subsystems) {
    return NextResponse.json(
      { error: `Unknown group "${groupParam}". Expected one of: ${Object.keys(GROUPS).join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const { data: dealerships, error } = await supabase.from("dealerships").select("id, business_category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Declared BEFORE any work starts, so a partial run is detectable by
  // comparison rather than by noticing nothing complained.
  const expected = (dealerships?.length ?? 0) * subsystems.length;
  let completed = 0;
  const failures: { dealershipId: string; subsystem: string; error: string }[] = [];

  // Each subsystem stays wrapped in runAndLog — one failing never
  // blocks the next, and each writes its own automation_run_log row.
  // What is new is that the outcome is COUNTED, not just logged.
  async function run<T>(dealershipId: string, subsystem: SubsystemKey, fn: () => Promise<T>) {
    const result = await runAndLog(supabase, dealershipId, subsystem, fn);
    if (result && typeof result === "object" && "error" in result) {
      failures.push({ dealershipId, subsystem, error: String((result as any).error) });
    } else {
      completed++;
    }
    return result;
  }

  const results: Record<string, any> = {};
  for (const dealership of dealerships ?? []) {
    const id = dealership.id;
    const category = dealership.business_category ?? "business";
    results[id] = {};
    const only = (key: SubsystemKey) => subsystems.includes(key);

    if (only("daily_autopilot")) results[id].dailyAutopilot = await run(id, "daily_autopilot", () => runDailyAutopilot(supabase, id));
    // Budget alerts read the snapshot daily_autopilot writes, so when
    // both are in the same group this ordering matters. They are in
    // DIFFERENT groups now (heavy vs signals), which means signals may
    // read yesterday's snapshot if heavy has not run yet today —
    // acceptable for an alert, and called out so it is not a surprise.
    if (only("budget_alerts")) results[id].budgetAlerts = await run(id, "budget_alerts", () => checkCampaignBudgets(supabase, id));
    if (only("email_automation")) results[id].emailAutomation = await run(id, "email_automation", () => runEmailAutomation(supabase, id));
    if (only("workflows")) results[id].workflows = await run(id, "workflows", () => runWorkflows(supabase, id));
    if (only("competitor_alerts")) results[id].competitorAlerts = await run(id, "competitor_alerts", () => checkCompetitorAlerts(supabase, id));
    if (only("topic_alerts")) results[id].topicAlerts = await run(id, "topic_alerts", () => checkTopicAlerts(supabase, id));
    if (only("report_snapshots")) results[id].reportSnapshots = await run(id, "report_snapshots", () => runReportSnapshots(supabase, id, category));
    if (only("content_autopilot")) results[id].contentAutopilot = await run(id, "content_autopilot", () => runContentAutopilot(supabase, id));
    if (only("google_reviews")) results[id].googleReviews = await run(id, "google_reviews", () => fetchGoogleReviewsSnapshot(supabase, id));
    if (only("seasonal_calendar")) results[id].seasonalCalendarEntries = await run(id, "seasonal_calendar", () => syncSeasonalCalendarEntries(supabase, id));
    if (only("churn_detection")) results[id].atRiskNotifications = await run(id, "churn_detection", () => notifyAtRiskCustomers(supabase, id));
    if (only("cold_lead_detection")) results[id].coldLeadNotifications = await run(id, "cold_lead_detection", () => notifyColdLeads(supabase, id));
    if (only("lead_scoring")) results[id].leadScores = await run(id, "lead_scoring", () => scoreActiveLeads(supabase, id));
    if (only("stale_approvals")) results[id].staleApprovals = await run(id, "stale_approvals", () => checkStalePendingApprovals(supabase, id));
  }

  // Platform-wide, so deliberately OUTSIDE the per-dealership loop —
  // it sums across every business at once rather than checking each in
  // isolation (see platformSpendAlertAgent.ts). Runs with the fast
  // group, and is not counted in `expected` because it is one call for
  // the whole platform rather than one per dealership.
  let platformSpend: any = null;
  if (!groupParam || groupParam === "signals") {
    try {
      platformSpend = await checkPlatformDailySpend(supabase);
    } catch (err: any) {
      console.error("[autopilot] platform spend check failed:", err.message);
      platformSpend = { error: err.message };
      failures.push({ dealershipId: "-", subsystem: "platform_spend", error: err.message });
    }
  }

  const partial = completed < expected || failures.length > 0;
  const summary = {
    ranAt: new Date().toISOString(),
    group: groupParam ?? "all",
    dealerships: dealerships?.length ?? 0,
    expected,
    completed,
    failed: failures.length,
    failures: failures.slice(0, 20),
    results,
    platformSpend,
  };

  if (partial) {
    // A NON-2XX is the point. Vercel records a failed cron invocation
    // and surfaces it in its own monitoring, so an incomplete run is
    // visible without building an alerting system for it. Returning
    // 200 with a failure count buried in the body is exactly the
    // silence the audit flagged.
    //
    // Deliberately strict: any subsystem failing for any dealership
    // marks the run failed. For a once-a-day job, a transient failure
    // that nobody hears about is worse than an alert that turns out to
    // be transient.
    console.error(`[autopilot] PARTIAL RUN group=${groupParam ?? "all"} completed=${completed}/${expected} failed=${failures.length}`);
    return NextResponse.json(summary, { status: 500 });
  }

  return NextResponse.json(summary);
}
