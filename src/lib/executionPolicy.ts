// Shared risk-level + action-type vocabulary — P0 Section 10
// ("Permission + Execution Policy") of the Master Development
// Specification audit. Complements approvalAuthority.ts, doesn't
// duplicate it: that file answers "who can approve THIS specific
// request" (role + ₹ threshold); this one answers "what kind of
// action is this, and how risky is it" — a shared vocabulary so
// routes/automations/tools can ask the same question the same way
// instead of each inventing its own ad hoc check.
//
// ACTION_POLICIES below is deliberately NOT a claim that every action
// in the app is catalogued — it's seeded with what's actually been
// audited so far (starting with the concrete ad-spend gating gap the
// Master Spec audit found: ad launch/activation had zero gating at
// all). Extend it as more pieces get audited, don't treat an action's
// absence here as "safe by default."

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ActionType = "read" | "create" | "edit" | "send" | "publish" | "spend" | "delete";

export interface ActionPolicy {
  actionType: ActionType;
  riskLevel: RiskLevel;
  description: string;
  // true = this action must never execute directly — it should create
  // a pending_approvals (or equivalent) row and wait for a human,
  // rather than the caller running it and asking forgiveness.
  requiresApproval: boolean;
}

export const ACTION_POLICIES: Record<string, ActionPolicy> = {
  // Revised after reading the actual route (10b): "launching" an ad
  // always creates the Meta campaign/adset/ad as status: "PAUSED" —
  // real external resources and real AI cost, but zero spend starts
  // here. The genuine spend trigger is exclusively ad_campaign_activate.
  ad_campaign_launch: { actionType: "create", riskLevel: "medium", description: "Create a new (paused) ad campaign draft on Meta — no spend starts until separately activated", requiresApproval: false },
  ad_campaign_activate: { actionType: "spend", riskLevel: "critical", description: "Turn an existing ad campaign's spend on", requiresApproval: true },
  refund_approve: { actionType: "spend", riskLevel: "critical", description: "Process a refund via Razorpay", requiresApproval: true },
  // Not approval-gated per-run — instead gated by an explicit,
  // deliberate on/off permission (Section 13, content_autopilot_enabled).
  // Listed here so its risk level is visible alongside everything else.
  content_autopilot_publish: { actionType: "publish", riskLevel: "high", description: "Post AI-generated content to a live social account with no review", requiresApproval: false },
  auto_call_new_lead: { actionType: "send", riskLevel: "medium", description: "Place a real outbound call to a new lead automatically", requiresApproval: false },
  auto_reply_dm: { actionType: "send", riskLevel: "medium", description: "Auto-reply to a DM or comment", requiresApproval: false },
  campaign_auto_pause: { actionType: "edit", riskLevel: "low", description: "Pause an underperforming campaign automatically — always reversible", requiresApproval: false },
  lead_update: { actionType: "edit", riskLevel: "low", description: "Update a lead record", requiresApproval: false },
  generate_draft: { actionType: "create", riskLevel: "low", description: "Generate a content/creative draft — nothing goes live", requiresApproval: false },
};

export function getActionPolicy(actionKey: string): ActionPolicy | null {
  return ACTION_POLICIES[actionKey] ?? null;
}
