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

// Triggered by Vercel Cron once a day (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
// is set as an env var — we check for it here. If CRON_SECRET isn't
// set yet, the route still works (useful while testing) but logs a
// warning, since it'd otherwise be publicly triggerable.
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

  const supabase = createServiceClient();
  const { data: dealerships, error } = await supabase.from("dealerships").select("id, business_category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Every subsystem call below is wrapped in runAndLog() — same
  // isolation the individual try/catch blocks gave before (one
  // subsystem failing never blocks the next), now also writing a
  // uniform automation_run_log row per subsystem per dealership
  // (migration 126, P0 12c), so "last run"/"success" exists for all
  // 13, not just the 3 that already had their own logging.
  const results: Record<string, any> = {};
  for (const dealership of dealerships ?? []) {
    results[dealership.id] = await runAndLog(supabase, dealership.id, "daily_autopilot", () => runDailyAutopilot(supabase, dealership.id));
    // Reads the snapshot runDailyAutopilot just wrote (via
    // snapshotCampaignPerformance) — must run after it, not before.
    results[dealership.id].budgetAlerts = await runAndLog(supabase, dealership.id, "budget_alerts", () => checkCampaignBudgets(supabase, dealership.id));
    results[dealership.id].emailAutomation = await runAndLog(supabase, dealership.id, "email_automation", () => runEmailAutomation(supabase, dealership.id));
    results[dealership.id].workflows = await runAndLog(supabase, dealership.id, "workflows", () => runWorkflows(supabase, dealership.id));
    results[dealership.id].competitorAlerts = await runAndLog(supabase, dealership.id, "competitor_alerts", () => checkCompetitorAlerts(supabase, dealership.id));
    results[dealership.id].topicAlerts = await runAndLog(supabase, dealership.id, "topic_alerts", () => checkTopicAlerts(supabase, dealership.id));
    results[dealership.id].reportSnapshots = await runAndLog(supabase, dealership.id, "report_snapshots", () => runReportSnapshots(supabase, dealership.id, dealership.business_category ?? "business"));
    results[dealership.id].contentAutopilot = await runAndLog(supabase, dealership.id, "content_autopilot", () => runContentAutopilot(supabase, dealership.id));
    results[dealership.id].googleReviews = await runAndLog(supabase, dealership.id, "google_reviews", () => fetchGoogleReviewsSnapshot(supabase, dealership.id));
    results[dealership.id].seasonalCalendarEntries = await runAndLog(supabase, dealership.id, "seasonal_calendar", () => syncSeasonalCalendarEntries(supabase, dealership.id));
    results[dealership.id].atRiskNotifications = await runAndLog(supabase, dealership.id, "churn_detection", () => notifyAtRiskCustomers(supabase, dealership.id));
    results[dealership.id].coldLeadNotifications = await runAndLog(supabase, dealership.id, "cold_lead_detection", () => notifyColdLeads(supabase, dealership.id));
    results[dealership.id].leadScores = await runAndLog(supabase, dealership.id, "lead_scoring", () => scoreActiveLeads(supabase, dealership.id));
    results[dealership.id].staleApprovals = await runAndLog(supabase, dealership.id, "stale_approvals", () => checkStalePendingApprovals(supabase, dealership.id));
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), dealerships: dealerships?.length ?? 0, results });
}
