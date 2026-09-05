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

// Keys below match real pending_approvals.action_type values wherever
// that row type exists (P0 11d) — getActionPolicy(approval.action_type)
// must actually hit, not silently miss on a naming mismatch.
export const ACTION_POLICIES: Record<string, ActionPolicy> = {
  // Revised after reading the actual route (10b): "launching" an ad
  // always creates the Meta campaign/adset/ad as status: "PAUSED" —
  // real external resources and real AI cost, but zero spend starts
  // here. The genuine spend trigger is exclusively activate_ad_campaign.
  // Not itself a pending_approvals action_type (launch never creates a
  // row) — kept for reference on the launch route's own risk profile.
  ad_campaign_launch: { actionType: "create", riskLevel: "medium", description: "Create a new (paused) ad campaign draft on Meta — no spend starts until separately activated", requiresApproval: false },
  activate_ad_campaign: { actionType: "spend", riskLevel: "critical", description: "Turn an existing ad campaign's spend on", requiresApproval: true },
  change_campaign_budget: { actionType: "spend", riskLevel: "high", description: "Change the daily budget on an already-launched campaign", requiresApproval: true },
  change_campaign_targeting: { actionType: "edit", riskLevel: "medium", description: "Change who an already-launched campaign targets", requiresApproval: true },
  // Refunds don't flow through pending_approvals yet (see /dashboard/refunds)
  // — kept as reference for when that's audited.
  refund_approve: { actionType: "spend", riskLevel: "critical", description: "Process a refund via Razorpay", requiresApproval: true },
  // Not approval-gated per-run — instead gated by an explicit,
  // deliberate on/off permission (Section 13, content_autopilot_enabled).
  // Listed here so its risk level is visible alongside everything else.
  content_autopilot_publish: { actionType: "publish", riskLevel: "high", description: "Post AI-generated content to a live social account with no review", requiresApproval: false },
  auto_call_new_lead: { actionType: "send", riskLevel: "medium", description: "Place a real outbound call to a new lead automatically", requiresApproval: false },
  auto_reply_dm: { actionType: "send", riskLevel: "medium", description: "Auto-reply to a DM or comment", requiresApproval: false },
  auto_paused_campaign: { actionType: "edit", riskLevel: "low", description: "Pause an underperforming campaign automatically — always reversible", requiresApproval: false },
  lead_update: { actionType: "edit", riskLevel: "low", description: "Update a lead record", requiresApproval: false },
  generate_draft: { actionType: "create", riskLevel: "low", description: "Generate a content/creative draft — nothing goes live", requiresApproval: false },

  // ---- Publish actions (migration 170, src/lib/publish) ------------
  // Writes to a merchant's own store or site. requiresApproval is
  // true on EVERY one of these, unconditionally, and that is a
  // deliberate departure from the rupee-threshold logic used above.
  //
  // The threshold asks "is this expensive enough to escalate?", which
  // is the right question about ad spend and a meaningless one here: a
  // price change carries no rupee amount of its own, and a ₹10 change
  // on the best-selling product is not a small action. Gating on
  // amount would let precisely that through.
  //
  // These are also the first actions in the product that change what a
  // merchant's CUSTOMERS see, immediately and publicly. An ad campaign
  // created paused spends nothing until someone activates it; a price
  // written to Shopify is live the moment it lands.
  update_product_price: { actionType: "edit", riskLevel: "critical", description: "Change a product's price in the merchant's own store — live and public immediately", requiresApproval: true },
  create_discount_code: { actionType: "create", riskLevel: "high", description: "Create a working discount code in the merchant's store — redeemable as soon as it exists", requiresApproval: true },
  update_product_description: { actionType: "edit", riskLevel: "medium", description: "Change a product's public description in the merchant's store", requiresApproval: true },
  publish_post: { actionType: "publish", riskLevel: "high", description: "Publish a post or page to the merchant's live site", requiresApproval: true },
  update_post: { actionType: "edit", riskLevel: "medium", description: "Change a post or page already live on the merchant's site", requiresApproval: true },
};

export function getActionPolicy(actionKey: string): ActionPolicy | null {
  return ACTION_POLICIES[actionKey] ?? null;
}
