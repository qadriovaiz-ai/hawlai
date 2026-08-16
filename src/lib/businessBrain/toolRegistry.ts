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

export const BUSINESS_BRAIN_TOOLS: BusinessBrainTool[] = [
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
    description: "Update this call's lead record with what you learned — status, budget, vehicle interest, purchase timing, deal value, or free-text notes.",
    parameters: {
      status: { type: "string", description: "One of: new, ready_to_call, appointment_set, not_interested. Never 'converted' — that needs a team member's review." },
      budget: { type: "number", description: "The lead's stated budget" },
      vehicle: { type: "string", description: "What the lead is interested in" },
      purchaseYear: { type: "number", description: "Year the lead wants to buy/purchase by" },
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
