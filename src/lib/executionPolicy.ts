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

  // ---- One-shot outbound actions reachable from chat (Phase 2B) ----
  //
  // THE GAP THESE CLOSE. The A-to-Z audit found five actions that one
  // sentence in chat could run with no approval at all, none of them in
  // any registry: a real email to a customer, a real phone call to a
  // customer, a public YouTube video, a live discount code, and the
  // toggles that switch on unattended posting, emailing and calling.
  //
  // They are NOT platform publish actions. The pipeline in src/lib/publish
  // edits a resource on a surface — it has previewDiff, targetRef and
  // staleness, all of which are about changing a thing that already
  // exists. Sending a message is not that shape, so these are gated the
  // way auto_call_new_lead and auto_reply_dm already are: a policy here,
  // a pending_approvals row, and execution inside the approvals route
  // after its authz and threshold checks.
  //
  // `requiresApproval: true` on every one. None of these is reversible
  // in the way that matters: a sent email, a placed call and a published
  // video cannot be unsent, unplaced or unseen.
  send_email: { actionType: "send", riskLevel: "high", description: "Send a real marketing or follow-up email to a lead, customer or team member — cannot be unsent", requiresApproval: true },
  place_outbound_call: { actionType: "send", riskLevel: "high", description: "Place a real phone call to a customer — cannot be unplaced", requiresApproval: true },
  publish_video: { actionType: "publish", riskLevel: "high", description: "Publish a video publicly to the business's YouTube channel", requiresApproval: true },
  // THE ONE THAT TURNS OFF EVERY OTHER GATE. After this runs, content
  // publishes and emails send with nobody looking, so it is gated even
  // though the write itself is a single boolean.
  set_automation_toggle: { actionType: "edit", riskLevel: "high", description: "Switch an unattended automation on or off — auto-posting, auto-email, auto-replies or auto-calling", requiresApproval: true },

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
  // G-3 step 1. The chat card for this used to post straight to
  // /api/graphic-design/generate, so the price the owner agreed to
  // existed only as a string in a browser label and nothing server-side
  // recorded the decision. The rupee figure now lands in
  // pending_approvals.amount, where the authority threshold can read it.
  //
  // "high" rather than "critical": the money is real but bounded - the
  // plan cap runs inside generateDesign, so the worst case is the
  // month's image allowance, and nothing reaches a customer.
  generate_graphic: { actionType: "create", riskLevel: "high", description: "Spend money generating one AI image, against the plan's monthly image allowance", requiresApproval: true },
  update_product_name: { actionType: "edit", riskLevel: "medium", description: "Change a product's public name in the merchant's store", requiresApproval: true },
  update_product_description: { actionType: "edit", riskLevel: "medium", description: "Change a product's public description in the merchant's store", requiresApproval: true },
  publish_post: { actionType: "publish", riskLevel: "high", description: "Publish a post or page to the merchant's live site", requiresApproval: true },
  // G-3 step 2. There is no per-page publish: websites.published is ONE
  // flag for the whole site, so approving this makes every page public
  // at once. The chat card used to POST the flag straight from the
  // browser.
  //
  // "high" and not "critical" because it is fully reversible with the
  // same flag, from Website Builder - no notification fires and no third
  // party is told. Taking it DOWN is deliberately not an action here at
  // all: P4 says the safe direction is never gated.
  publish_site: { actionType: "publish", riskLevel: "high", description: "Make the merchant's ENTIRE site public - every page at once", requiresApproval: true },
  update_post: { actionType: "edit", riskLevel: "medium", description: "Change a post or page already live on the merchant's site", requiresApproval: true },
  // Creates a campaign, ad set and ad on Meta, all PAUSED. Spends
  // nothing by itself -- activation is a separate, separately-gated
  // step (ad_campaign_activate). Gated anyway because these are real
  // public objects in the merchant's own account, under their brand.
  launch_ad_campaign: { actionType: "create", riskLevel: "high", description: "Create a paused ad campaign in the merchant's Meta account -- real objects, no spend until activated", requiresApproval: true },
  // The two lines a stranger reads about this business in a search
  // result. Nothing spends, and it is entirely reversible — but it is
  // public copy about the business, written from a chat message, so it
  // is gated like the rest of this group rather than on cost.
  update_page_meta: { actionType: "edit", riskLevel: "medium", description: "Change the search title or meta description on a page of the merchant's own site — what Google and link previews show", requiresApproval: true },
  // The words a visitor reads on the page itself. There is no draft
  // layer inside a published site — website_pages IS what /site/{slug}
  // renders — so an approved edit is public the moment it saves.
  update_page_text: { actionType: "edit", riskLevel: "medium", description: "Change a heading, paragraph or button label on a page of the merchant's own site — what a visitor reads", requiresApproval: true },
};

export function getActionPolicy(actionKey: string): ActionPolicy | null {
  return ACTION_POLICIES[actionKey] ?? null;
}

/**
 * Every automation toggle, and how bad it is to switch on.
 *
 * All six are approval-gated. The levels differ because the consequence
 * differs: four of them put words in front of a customer or dial a phone
 * with nobody watching, and two only send a transactional email the owner
 * already asked for.
 *
 * DELIBERATE ADDITION, worth naming: the instruction listed
 * dm_auto_reply, comment_auto_reply and auto_call_new_leads as the high-
 * risk three. content_autopilot is here with them because it POSTS
 * PUBLICLY with no review, which is the same class of consequence — a
 * public post cannot be unseen any more than a placed call can be
 * unplaced.
 */
export const AUTOMATION_TOGGLES: Record<string, { risk: RiskLevel; what: string }> = {
  dm_auto_reply: { risk: "critical", what: "replies to every customer DM with nobody reading it first" },
  comment_auto_reply: { risk: "critical", what: "replies publicly to comments with nobody reading it first" },
  auto_call_new_leads: { risk: "critical", what: "places a real phone call to every new lead automatically" },
  content_autopilot: { risk: "critical", what: "posts to your social accounts on a schedule with no review" },
  welcome_email: { risk: "high", what: "emails every new lead automatically" },
  follow_up_email: { risk: "high", what: "emails leads a follow-up automatically" },
};

/** The risk of switching one toggle, or null when the name isn't a known toggle. */
export function toggleRisk(toggle: string): { risk: RiskLevel; what: string } | null {
  return AUTOMATION_TOGGLES[toggle] ?? null;
}
