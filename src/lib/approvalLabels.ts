import { titleCaseFromSnake } from "./utils";

// Bespoke, more human labels for the action_type/agent slugs actually in
// use today (see autopilotAgent.ts and api/approvals/[id]/route.ts) —
// falls back to generic Title Case for anything not listed here, since
// action_type is intentionally free-text at the schema level (new agents
// can introduce new types without a migration) and must never render as
// a raw, unmapped machine string.
const ACTION_TYPE_LABELS: Record<string, string> = {
  change_campaign_budget: "Increase campaign budget",
  change_campaign_targeting: "Change campaign targeting",
  activate_ad_campaign: "Activate ad spend",
  auto_paused_campaign: "Auto-paused a low performer",
  launch_campaign: "Launch new campaign",
  pause_campaign: "Pause campaign",
};

const AGENT_LABELS: Record<string, string> = {
  autopilot_auto_pause: "Autopilot",
  paid_ads_agent: "Paid Ads Agent",
  optimization_agent: "Optimization Agent",
  master_chat_campaign_edit: "Master Chat",
  ads_status_route: "Campaign Manager",
};

export function humanizeActionType(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] ?? titleCaseFromSnake(actionType);
}

export function humanizeAgentName(agentSlug: string): string {
  return AGENT_LABELS[agentSlug] ?? titleCaseFromSnake(agentSlug);
}
