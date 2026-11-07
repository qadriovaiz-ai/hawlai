// The function each daily-cron subsystem runs, by key — one table, so
// the run order is decided by cronGroups.ts and nothing else.

import { runDailyAutopilot } from "@/lib/agents/autopilotAgent";
import { runResultsJob } from "@/lib/growth/resultsJob";
import { runMonthlyReview } from "@/lib/growth/monthlyReview";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { runWorkflows } from "@/lib/automation/workflowEngine";
import { checkCompetitorAlerts } from "@/lib/automation/competitorMonitor";
import { checkTopicAlerts } from "@/lib/automation/topicMonitor";
import { runReportSnapshots } from "@/lib/automation/reportSnapshot";
import { runContentAutopilot } from "@/lib/automation/contentAutopilot";
import { fetchGoogleReviewsSnapshot } from "@/lib/agents/reputationAgent";
import { runSeasonalCalendar } from "@/lib/agents/seasonalityAgent";
import { notifyAtRiskCustomers } from "@/lib/agents/churnAgent";
import { notifyColdLeads } from "@/lib/agents/coldLeadAgent";
import { checkCampaignBudgets } from "@/lib/agents/budgetAlertAgent";
import { scoreActiveLeads } from "@/lib/agents/leadScoringAgent";
import { checkStalePendingApprovals } from "@/lib/automation/staleApprovalDetection";
import { runScheduledLeadExport } from "@/lib/leads/scheduledExport";
import { runTechnicalAudit } from "@/lib/seo/runTechnicalAudit";
import { runPageSpeed } from "@/lib/seo/pageSpeed";
import { runAeoSchedule } from "@/lib/seo/aeoSchedule";
import { siteBase } from "@/lib/claims/businessFacts";
import { syncSearchQueries } from "@/lib/seo/searchQueries";
import { runContentPerformance } from "@/lib/attribution/runContentPerformance";
import { runStrategySignals } from "@/lib/strategy/strategySignals";
import { monitorAndDemote } from "@/lib/autonomy/demotion";
import { reviewAutonomy } from "@/lib/autonomy/review";
import type { SubsystemKey } from "@/lib/automation/cronGroups";

export const DAILY_RUNNERS: Record<SubsystemKey, (supabase: any, dealershipId: string, category: string) => Promise<unknown>> = {
  // S5/P2 — measures decisions whose check date has passed. Model-free,
  // so it belongs in `signals` with the other database-only work.
  decision_results: (s, id) => runResultsJob(s, id),
  // S5/P5 — the monthly review, which returns a skip on the other
  // thirty days of the month. Model-free and read-only apart from the
  // send, so it belongs here rather than in the heavy group.
  monthly_review: (s, id) => runMonthlyReview(s, id),
  // G4. The site address comes from the one place that knows it, rather
  // than being rebuilt here from an env var.
  page_speed: (s, id) => runPageSpeed(s, id, { siteBase: siteBase() }),
  // A5 — the AEO check given the cadence it always needed. The agent
  // already records every run and derives the trend; all that was
  // missing was a second run to compare against. Monthly and flagged
  // off, both decided inside the function.
  aeo_schedule: (s, id) => runAeoSchedule(s, id),
  // S7/P2 — reads claim_checks rows that went out and asks the
  // extractor about them again. Costs money, so it is capped per
  // business per run inside the function rather than by a flag here.
  //
  // S7/P3 JOINS THE TWO, and not inside either one: the monitor spends
  // money and talks to a model, and the rule that takes a permission
  // away must be testable without either. The join is
  // `monitorAndDemote` rather than an inline body here, because this
  // table has one job and every entry in it is one line.
  output_monitor: (s, id) => monitorAndDemote(s, id),
  // S7/P6 — asks ONCE, when the evidence is there. Raises a card and
  // nothing else: the level is written only when the owner approves it.
  autonomy_review: (s, id) => reviewAutonomy(s, id),
  daily_autopilot: (s, id) => runDailyAutopilot(s, id),
  content_autopilot: (s, id) => runContentAutopilot(s, id),
  report_snapshots: (s, id, category) => runReportSnapshots(s, id, category),
  email_automation: (s, id) => runEmailAutomation(s, id),
  workflows: (s, id) => runWorkflows(s, id),
  competitor_alerts: (s, id) => checkCompetitorAlerts(s, id),
  topic_alerts: (s, id) => checkTopicAlerts(s, id),
  google_reviews: (s, id) => fetchGoogleReviewsSnapshot(s, id),
  // One run, one log row: planning entries (only when the business has
  // Seasonal Campaigns on) plus the out-of-season warning, which runs
  // for every business because it changes nothing.
  seasonal_calendar: (s, id) => runSeasonalCalendar(s, id),
  // Budget alerts read the snapshot daily_autopilot writes. They're in
  // different groups (signals runs first), so they may read yesterday's
  // snapshot — acceptable for an alert.
  budget_alerts: (s, id) => checkCampaignBudgets(s, id),
  churn_detection: (s, id) => notifyAtRiskCustomers(s, id),
  cold_lead_detection: (s, id) => notifyColdLeads(s, id),
  lead_scoring: (s, id) => scoreActiveLeads(s, id),
  stale_approvals: (s, id) => checkStalePendingApprovals(s, id),
  lead_export: (s, id) => runScheduledLeadExport(s, id),
  // Reads stored pages and runs pure code — no AI call, no web request —
  // so it belongs in the database-only group and costs nothing to run
  // daily for every business (lib/seo/technicalAudit.ts).
  site_audit: (s, id) => runTechnicalAudit(s, id),
  // A third-party API call, so it belongs in the heavy group rather than
  // the database-only one. Costs nothing in AI, and businesses with no
  // Search Console connection return a reason and stop.
  search_console_sync: (s, id) => syncSearchQueries(s, id),
  // Arithmetic over stored attribution rows — no AI, no third party — so
  // it sits with the database-only work. Says what it can't tell yet as
  // readily as what it can (lib/attribution/performanceBrain.ts).
  content_performance: (s, id) => runContentPerformance(s, id),
  // The last two departments filing what they already counted — the
  // funnel and the competitor comparison. Reads only, no AI call.
  strategy_signals: (s, id) => runStrategySignals(s, id),
};
