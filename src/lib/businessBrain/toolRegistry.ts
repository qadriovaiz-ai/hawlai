// Business Brain — tool registry (catalog, not the dispatcher).
//
// A single documented shape for "actions the Business Brain could
// eventually expose," designed so one definition can later render
// into BOTH Claude's tool schema (for Master Chat, see masterBrainV2.ts's
// TOOLS array) and Vapi's function-calling schema (for live calls)
// without maintaining the same tool twice.
//
// The live tool-calling framework itself (toolDispatcher.ts + the
// webhook's tool-calls branch) now exists, and real "call"-channel
// tools below have grown across two phases: check_availability/
// create_appointment/update_lead (Phase 2), check_order_status/
// escalate_to_human/log_complaint/request_refund (Phase 3) —
// vapiCallAgent.ts builds a real model.tools array from whatever's
// channels-enabled here (see toVapiFunctionDefinition/
// getCallEnabledVapiTools below) and sends it with every outbound call.
//
// `channels` records where each action is reachable *today* — most
// are chat-only. `handlerRef` points at the already-reusable function
// backing it (see the Phase 1 audit: masterBrainV2.ts's executeTool
// cases are thin wrappers around plain, already-decoupled functions),
// so wiring a new channel onto an existing action is "call the same
// function from a new place," not "write new business logic."

export interface BusinessBrainToolParam {
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
}

export interface BusinessBrainTool {
  name: string;
  description: string;
  parameters: Record<string, BusinessBrainToolParam>;
  channels: ("chat" | "call")[];
  handlerRef: string; // file:function pointer to the real, reusable handler
  status: "live" | "planned"; // planned = handler doesn't exist yet, tracked for Phase 2
}

// ------------------------------------------------------------------
// WHAT EACH CHAT TOOL CHANGES — S6/P2.
// ------------------------------------------------------------------
//
// S6's exit clause, restated by the founder on 4 November 2026, is
// "nothing that changes state is reachable except through an Action".
// To test that over all 59 tools, something has to say which tools
// change anything AT ALL — otherwise a new tool nobody classified is
// invisible to the check, which is the hole "tool count falls" left
// wide open.
//
// THE FOUR FAMILIES, and the question each answers is "what does this
// change OUTSIDE this product?":
//
//   read          nothing. It returns information.
//   Internal      only this product's own rows: a draft, a goal, a
//                 task, a setting, a memory. Nothing a customer or a
//                 platform can see.
//   ResourceEdit  a resource on a platform or on the business's own
//                 site or store. There is a `before`, and undo is
//                 real. These go through src/lib/publish/.
//   Dispatch      a one-shot send: an email, a call, an upload, a
//                 post. There is no `before` and NO UNDO, which is
//                 why src/lib/dispatch/ exists.
//
// THE SCHEMAS ARE NOT DUPLICATED HERE, deliberately. The plan's P2 row
// said this registry would grow from 18 entries to every
// state-changing tool — which would mean hand-copying 41 parameter
// schemas that masterBrainV2.ts already holds, and P3's whole job is
// to move those ONCE. So P2 does the part the exit test needs (which
// family each tool is in) and P3 moves the definitions.
//
// EVERY LABEL BELOW WAS MEASURED, not guessed: the call graph was
// walked out of each tool's own case body with the Actions treated as
// walls (tests/helpers/reachability.ts), and the non-obvious ones were
// read by hand. tests/toolFamilies.test.ts re-checks the labels
// against that walk on every run, so a tool that grows a send stops
// matching its label.

export type ToolFamily = "read" | "Internal" | "ResourceEdit" | "Dispatch";

export const TOOL_FAMILIES: Record<string, ToolFamily> = {
  // ---- read: returns information, changes nothing ------------------
  read_page: "read",
  generate_seo: "read",
  generate_social_management: "read",
  generate_email: "read",
  generate_whatsapp: "read",
  generate_ad_plan: "read",
  generate_video_task: "read",
  research_competitor: "read",
  research_market: "read",
  generate_cro_suggestions: "read",
  get_growth_advice: "read",
  generate_influencer_outreach: "read",
  generate_retargeting_copy: "read",
  generate_seo_keywords: "read",
  get_analytics_summary: "read",
  get_customer_sentiment: "read",
  get_follow_up_reminders: "read",
  get_website_analytics: "read",
  diagnose_business: "read",
  plan_budget: "read",
  competitor_positioning: "read",
  business_story: "read",
  // Produces a CSV for the owner and hands it back. The SCHEDULED
  // export emails it, which is why schedule_lead_export is not here.
  export_leads: "read",

  // ---- Internal: this product's own rows, and nothing else ---------
  generate_brand_kit: "Internal",
  generate_logo: "Internal",
  generate_marketing_strategy: "Internal",
  remember_insight: "Internal",
  create_workflow: "Internal",
  manage_watch: "Internal",
  assign_task: "Internal",
  set_goal: "Internal",
  assign_lead: "Internal",
  add_lead: "Internal",
  save_business_story: "Internal",
  schedule_lead_export: "Internal",
  edit_canvas_design: "Internal",
  generate_3d_scene: "Internal",
  // A draft content piece. It can also OFFER to post it, which raises
  // an approval for publish_social_post — raising an approval changes
  // nothing by itself, so it does not make this a Dispatch.
  generate_content: "Internal",
  // An ad_creative row in draft. Launching it is launch_meta_campaign.
  create_product_ad: "Internal",
  // Writes the business's own website address into its settings,
  // confirmed in two steps by the tool itself.
  update_website_url: "Internal",
  // GATED FOR SPEND, NOT FOR REACH. It asks before generating because
  // the image costs money — nothing leaves the product. The families
  // answer "what does this change outside", and "what does this cost"
  // is a separate axis that executionPolicy's riskLevel already holds.
  generate_graphic: "Internal",
  // GATED FOR WHAT IT ENABLES. Switching an automation on changes
  // future behaviour rather than a resource — and switching it OFF is
  // never gated (rule 6).
  set_automation_toggle: "Internal",
  // Writes a booking slug the first time it is asked for, so the
  // /book/<slug> address is stable. Derived, not authored.
  get_booking_link: "Internal",
  get_report_links: "Internal",
  // Writes a new product into the business's own catalogue. CREATING
  // is direct; EDITING an existing product's price, name or
  // description is approval-gated through publish/ (migration-era
  // ActionKeys). Worth a look in a later phase, recorded here rather
  // than changed in a classification commit.
  add_product: "Internal",

  // ---- ResourceEdit: a platform or site resource, through publish/ --
  build_website: "ResourceEdit",
  propose_page_meta: "ResourceEdit",
  edit_page_text: "ResourceEdit",
  undo_page_edit: "ResourceEdit",
  propose_price_change: "ResourceEdit",
  launch_meta_campaign: "ResourceEdit",
  activate_meta_campaign: "ResourceEdit",
  // Ungated by decision (rule 6): see tests/helpers/ungatedByDecision.
  pause_meta_campaign: "ResourceEdit",
  propose_campaign_budget_change: "ResourceEdit",
  propose_campaign_targeting_change: "ResourceEdit",
  create_discount_code: "ResourceEdit",

  // ---- Dispatch: one-shot, no undo --------------------------------
  trigger_call: "Dispatch",
  publish_to_youtube: "Dispatch",
  send_email: "Dispatch",
};

/** The family a tool belongs to, or null when nobody has classified it. */
export function familyOf(tool: string): ToolFamily | null {
  return Object.prototype.hasOwnProperty.call(TOOL_FAMILIES, tool)
    ? TOOL_FAMILIES[tool]
    : null;
}

/** Every tool in one family. */
export function toolsInFamily(family: ToolFamily): string[] {
  return Object.keys(TOOL_FAMILIES).filter((t) => TOOL_FAMILIES[t] === family);
}

/** The tools that change something outside this product. */
export function stateChangingTools(): string[] {
  return Object.keys(TOOL_FAMILIES).filter((t) => TOOL_FAMILIES[t] !== "read");
}

export const BUSINESS_BRAIN_TOOLS: BusinessBrainTool[] = [
  {
    name: "propose_price_change",
    description:
      "Request a price change on a product in the connected Shopify store. Never applies it directly — resolves the product and shows a preview with Approve/Reject buttons inline in the chat, where the person decides. Never directs them to a separate page.",
    parameters: {
      product_description: { type: "string", description: "How the person referred to the product, in their own words", required: true },
      new_price: { type: "string", description: "The price they want, as a plain number", required: true },
      variant_id: { type: "string", description: "Only on a follow-up call, after candidates were shown and one was picked" },
    },
    // CHAT ONLY, deliberately. On a voice call there is no way to show
    // a candidate list with prices and images, and "which one did you
    // mean?" over the phone against five similar variants is how the
    // wrong product gets repriced. The resolution rule is never guess;
    // a channel that cannot show the options cannot honour it.
    channels: ["chat"],
    handlerRef: "lib/publish/create.ts:createPublishAction",
    status: "live",
  },

  {
    name: "launch_meta_campaign",
    description:
      "Create a Facebook/Instagram ad campaign in the connected Meta ad account. Never launches it directly — writes the ad copy, builds the creative around the real product photo from the connected store (falling back to a generated image only when there isn't one), and shows a preview with Approve/Reject buttons inline in the chat, where the person decides. Everything is created paused, so approving spends nothing. Never directs them to a separate page.",
    parameters: {
      description: { type: "string", description: "What the person wants to advertise, in their own words", required: true },
      daily_budget: { type: "string", description: "Daily budget if they named one, as a plain number of rupees" },
      product_description: { type: "string", description: "Which product the ad is for, so its real store photo can be used" },
      variant_id: { type: "string", description: "Only on a follow-up call, after product candidates were shown and one was picked" },
    },
    // CHAT ONLY. The decision rests on seeing the creative image and
    // the copy; read aloud on a call, "approve this ad?" is a question
    // about something the person cannot see.
    channels: ["chat"],
    handlerRef: "lib/publish/platforms/meta.ts:createMetaPlatform",
    status: "live",
  },

  {
    name: "activate_meta_campaign",
    description:
      "Start a paused Meta campaign from chat. Approval-gated: shows Approve / Reject inline, and only reports success once Meta confirms the ad is genuinely delivering. Never directs them to Ads Manager.",
    parameters: {
      campaign_description: { type: "string", description: "Which campaign, in their words" },
      campaign_id: { type: "string", description: "Only on a follow-up, after a numbered list was shown" },
    },
    // CHAT ONLY: the person is approving real spend and should see the
    // campaign, its creative and its budget, not hear them read out.
    channels: ["chat"],
    handlerRef: "lib/agents/masterBrainV2.ts:activateMetaCampaign",
    status: "live",
  },
  {
    name: "pause_meta_campaign",
    description:
      "Pause a running Meta campaign immediately, stopping spend. No approval — stopping spend is reversible and urgent. Confirms with Meta that delivery stopped.",
    parameters: {
      campaign_description: { type: "string", description: "Which campaign, in their words" },
      campaign_id: { type: "string", description: "Only on a follow-up, after a numbered list was shown" },
    },
    // Voice too: "pause my ad" on a call should work, and nothing about
    // stopping spend needs to be seen.
    channels: ["chat", "call"],
    handlerRef: "lib/agents/masterBrainV2.ts:pauseMetaCampaign",
    status: "live",
  },
  {
    name: "update_website_url",
    description:
      "Save the business's website address to their settings, from the chat. Confirmed in two steps — shows what will change, writes only after the person agrees — because this address is what ads fall back to when there is no specific product page.",
    parameters: {
      url: { type: "string", description: "The website address as they gave it; a bare domain is fine", required: true },
      confirmed: { type: "boolean", description: "Only on the second call, after they have agreed in chat" },
    },
    // Usable on a call too: it is a short spoken value with a spoken
    // confirmation, and nothing about the decision needs to be seen.
    channels: ["chat", "call"],
    handlerRef: "lib/agents/masterBrainV2.ts:update_website_url",
    status: "live",
  },

  {
    name: "add_lead",
    description: "Create a new lead/CRM record for this business.",
    parameters: {
      name: { type: "string", description: "Lead's name", required: true },
      phone: { type: "string", description: "Lead's phone number", required: true },
      email: { type: "string", description: "Lead's email, if known" },
      notes: { type: "string", description: "Any context about the lead" },
    },
    channels: ["chat"],
    handlerRef: "masterBrainV2.ts:executeTool case 'add_lead' -> leads insert + recordFirstTouchpoint",
    status: "live",
  },
  {
    name: "trigger_call",
    description: "Trigger an outbound AI phone call to a lead.",
    parameters: {
      leadId: { type: "string", description: "The lead to call", required: true },
    },
    channels: ["chat"],
    handlerRef: "vapiCallAgent.ts:triggerVapiCall",
    status: "live",
  },
  {
    name: "export_leads",
    description: "Export the business's leads as a CSV downloaded from chat (owner/admin only).",
    parameters: {
      temperature: { type: "string", description: "hot / warm / cold", required: false },
      status: { type: "string", description: "Lead status", required: false },
      source: { type: "string", description: "Lead source", required: false },
      from: { type: "string", description: "Created on or after, YYYY-MM-DD", required: false },
      to: { type: "string", description: "Created on or before, YYYY-MM-DD", required: false },
      hasEmail: { type: "boolean", description: "Only leads with an email", required: false },
    },
    channels: ["chat"],
    handlerRef: "exportLeads.ts:fetchLeadsForExport",
    status: "live",
  },
  {
    name: "schedule_lead_export",
    description: "Turn the weekly/monthly leads export email on or off (owner/admin only).",
    parameters: {
      frequency: { type: "string", description: "weekly / monthly / off", required: true },
    },
    channels: ["chat"],
    handlerRef: "scheduledExport.ts:runScheduledLeadExport",
    status: "live",
  },
  {
    name: "send_email",
    description: "Send an email on the business's behalf.",
    parameters: {
      to: { type: "string", description: "Recipient email", required: true },
      subject: { type: "string", description: "Email subject", required: true },
      body: { type: "string", description: "Email body", required: true },
    },
    channels: ["chat"],
    handlerRef: "sendDealerEmail.ts:sendDealerEmail",
    status: "live",
  },
  // Phase 2 piece 2 — the first two real call-enabled tools. leadId is
  // deliberately NOT a parameter here (unlike add_lead/trigger_call) —
  // on a call, the lead is already known from call.metadata, so the
  // handler reads it from ToolCallContext instead of asking the model
  // to supply it (one less thing the model could get wrong).
  {
    name: "check_availability",
    description: "Check real appointment availability for this business over the next 7 days.",
    parameters: {},
    channels: ["call"],
    handlerRef: "toolDispatcher.ts:handleCheckAvailability -> appointmentSlots.ts:getAvailableSlots",
    status: "live",
  },
  {
    name: "create_appointment",
    description: "Book an appointment for the lead on this call, at a time returned by check_availability.",
    parameters: {
      appointmentDate: { type: "string", description: "Exact ISO datetime value from check_availability's result — never invented or guessed", required: true },
      notes: { type: "string", description: "Any context about what the appointment is for" },
    },
    channels: ["call"],
    handlerRef: "toolDispatcher.ts:handleCreateAppointment -> appointmentSlots.ts:createAppointmentForLead",
    status: "live",
  },
  // Phase 2 piece 3 — no leadId param, same reasoning as above. Status
  // is deliberately restricted to a subset of leads.status's full enum
  // (explicit decision: "converted" stays human-only, set nowhere but
  // the dashboard).
  {
    name: "update_lead",
    description: "Update this call's lead record with what you learned — status, what they want, budget, their company, a preferred date, what they use today, deal value, or free-text notes.",
    parameters: {
      status: { type: "string", description: "One of: new, ready_to_call, appointment_set, not_interested. Never 'converted' — that needs a team member's review." },
      budget: { type: "number", description: "The lead's stated budget" },
      interest: { type: "string", description: "What the lead wants — a product, service, plan or requirement, in their words" },
      company: { type: "string", description: "The company the lead works for or is buying for, if they said" },
      preferredDate: { type: "string", description: "When the lead would like it — a date, week or time they mentioned" },
      currentSolution: { type: "string", description: "What the lead uses or who they buy from today, if they said" },
      dealValue: { type: "number", description: "Estimated deal value, if known" },
      notes: { type: "string", description: "Free-text notes about what was discussed — saved as a CRM note, not overwritten on the next update. For an actual complaint (something went wrong), use log_complaint instead — not this." },
    },
    channels: ["call"],
    handlerRef: "toolDispatcher.ts:handleUpdateLead -> leads update (allowlisted fields) + lead_notes insert",
    status: "live",
  },
  // Phase 3 piece 1 — no orderId/phone param: matches by the call's
  // own lead's phone number, resolved server-side, rather than asking
  // the model to supply or transcribe a phone number by voice.
  {
    name: "check_order_status",
    description: "Look up this caller's recent orders by their phone number and return status, payment status, and items.",
    parameters: {},
    channels: ["call"],
    handlerRef: "toolDispatcher.ts:handleCheckOrderStatus -> orders table, matched by normalized phone",
    status: "live",
  },
  // Phase 3 piece 2 — callback-promise escalation, not a live transfer
  // (explicit decision, migration 122's header explains why: no phone
  // number exists to transfer to, inbound is still dormant). Ends the
  // call gracefully instead; a human gets alerted with full context.
  {
    name: "escalate_to_human",
    description: "Flag this call for a team member to take over via callback — use when you're confused, can't help with what the caller needs, or they explicitly ask to speak to a person. This ends the call with a promised callback, not a live transfer.",
    parameters: {
      reason: { type: "string", description: "Why you're escalating and what the caller needs — as much relevant detail as possible, since a team member will act on this without having heard the call themselves", required: true },
    },
    channels: ["call"],
    handlerRef: "toolDispatcher.ts:handleEscalateToHuman -> emitNotification (kind: call_escalated)",
    status: "live",
  },
  // Phase 3 piece 3 — a real trackable record (complaints table),
  // separate from escalate_to_human by design (a complaint doesn't
  // end the call by itself). relatedOrderId takes the exact "order id"
  // value check_order_status's result includes, same pattern as
  // create_appointment's exact-slot-value requirement.
  {
    name: "log_complaint",
    description: "Log a complaint from this caller with real specifics, so a team member can act on it and track it through to resolution. Doesn't end the call.",
    parameters: {
      description: { type: "string", description: "The complaint in the caller's own specifics — what went wrong, when, any details they gave", required: true },
      relatedOrderId: { type: "string", description: "The exact order id from check_order_status's result, only if this complaint is about a specific order" },
    },
    channels: ["call"],
    handlerRef: "toolDispatcher.ts:handleLogComplaint -> complaints insert + emitNotification",
    status: "live",
  },
  // Phase 3 piece 4 — real money never moves from this tool. It only
  // ever creates a "requested" row; a human approving it via the
  // dashboard is the sole path to an actual Razorpay refund (see
  // /api/refunds and createRazorpayRefund in razorpay.ts). The
  // description is deliberately explicit about this so the model
  // never treats calling this tool as the refund having happened.
  {
    name: "request_refund",
    description: "Submit a refund request for a specific paid order for a team member to review — this does NOT process the refund. No money moves until a human approves it on the dashboard.",
    parameters: {
      orderId: { type: "string", description: "The exact order id from check_order_status's result", required: true },
      reason: { type: "string", description: "Why the caller wants a refund", required: true },
      amount: { type: "number", description: "Requested refund amount in rupees, if less than the full order total — omit for a full refund" },
    },
    channels: ["call"],
    handlerRef: "toolDispatcher.ts:handleRequestRefund -> refund_requests insert + emitNotification (kind: refund_requested)",
    status: "live",
  },
  {
    name: "send_whatsapp",
    description: "Send a WhatsApp message to a lead. NOT YET BUILT ANYWHERE — even Master Chat's generate_whatsapp is explicitly draft-only (manual tap-to-send). Do not scope this into a live-call tool until a real send capability exists at all, per explicit instruction.",
    parameters: {
      leadId: { type: "string", description: "The lead to message", required: true },
      message: { type: "string", description: "Message content", required: true },
    },
    channels: [],
    handlerRef: "NOT BUILT — no send capability exists in the app yet, not just for calls",
    status: "planned",
  },
];

// ------------------------------------------------------------------
// Renders a BusinessBrainTool into Vapi's function-calling schema
// (OpenAI-compatible: {type:"function", function:{name, description,
// parameters}}) — the one definition above serves both Claude's tool
// schema (masterBrainV2.ts's TOOLS array, built independently today)
// and Vapi's, without hand-writing the same tool twice.
//
// Exact field names here are Vapi's documented function-calling
// contract as best represented in this codebase; if Vapi's API has
// since changed shape, the failure mode is safe, not silent-broken: a
// malformed model.tools value causes Vapi's call-creation request to
// be rejected outright (see vapiCallAgent.ts), so the call simply
// fails to start with a clear error — it cannot corrupt or crash a
// call that's already in progress.
// ------------------------------------------------------------------

export interface VapiFunctionToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export function toVapiFunctionDefinition(tool: BusinessBrainTool): VapiFunctionToolDefinition {
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];
  for (const [key, param] of Object.entries(tool.parameters)) {
    properties[key] = { type: param.type, description: param.description };
    if (param.required) required.push(key);
  }
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: { type: "object", properties, required } },
  };
}

export function getCallEnabledVapiTools(): VapiFunctionToolDefinition[] {
  return BUSINESS_BRAIN_TOOLS.filter((t) => t.channels.includes("call") && t.status === "live").map(toVapiFunctionDefinition);
}
