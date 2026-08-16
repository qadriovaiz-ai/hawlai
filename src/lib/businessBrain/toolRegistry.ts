// Business Brain — tool registry (catalog only, not yet wired to any
// live call).
//
// This is metadata, not a dispatcher: a single documented shape for
// "actions the Business Brain could eventually expose," designed so
// one definition can later render into BOTH Claude's tool schema (for
// Master Chat, see masterBrainV2.ts's TOOLS array) and Vapi's function-
// calling schema (for live calls) without maintaining the same tool
// twice. Nothing in this file is invoked automatically by anything —
// Phase 1's own approved sequence puts the actual live tool-calling
// framework (a new webhook branch handling Vapi's tool-calls message,
// wired into a real call) deliberately LAST, after the knowledge base,
// this module, and structured intent/sentiment output all ship, since
// a bad tool response mid-call is the one failure mode here that can
// break a real, in-progress customer conversation.
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
  // Both confirmed gaps from the Phase 1 audit — no handler exists yet
  // for either. Listed here so Phase 2 (real tool-calling) has a
  // starting inventory instead of re-deriving this from scratch.
  {
    name: "create_appointment",
    description: "Book an appointment for a lead. NOT YET BUILT — appointments are currently only created via a plain REST route from a UI modal (src/app/api/appointments/route.ts), never from chat or a call.",
    parameters: {
      leadId: { type: "string", description: "The lead the appointment is for", required: true },
      appointmentDate: { type: "string", description: "ISO datetime", required: true },
      notes: { type: "string", description: "Any context" },
    },
    channels: [],
    handlerRef: "NOT BUILT — extract reusable logic from src/app/api/appointments/route.ts when this is scheduled",
    status: "planned",
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
