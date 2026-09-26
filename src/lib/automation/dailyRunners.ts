// The function each daily-cron subsystem runs, by key — one table, so
// the run order is decided by cronGroups.ts and nothing else.

import { runDailyAutopilot } from "@/lib/agents/autopilotAgent";
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
import type { SubsystemKey } from "@/lib/automation/cronGroups";

export const DAILY_RUNNERS: Record<SubsystemKey, (supabase: any, dealershipId: string, category: string) => Promise<unknown>> = {
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
};
