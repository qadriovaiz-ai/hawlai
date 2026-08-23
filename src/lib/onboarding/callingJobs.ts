// ------------------------------------------------------------------
// Calling employee jobs — UX Transformation, piece 5b.
// ------------------------------------------------------------------
// The mandate is explicit: do NOT expose "persona" as the customer-
// facing concept. A business owner hires someone to do a JOB. So the
// customer picks a job in their own language, and this maps it to the
// existing persona architecture internally — no new agent system, no
// duplicate tool allowlists.
//
// Every job here maps onto one of the three personas that already
// exist (personas.ts, migration 139). Several jobs share a persona,
// which is correct: "call new leads" and "sales calls" are genuinely
// the same underlying behaviour with different framing to the owner.
//
// suggestedTools is a STARTING POINT for the permissions step, not a
// grant. The persona's own allowlist remains the ceiling — a job can
// only ever suggest a subset of what its persona already permits,
// enforced in resolveJobTools() below rather than trusted from the UI.

import { AGENT_PERSONAS, type PersonaKey } from "@/lib/agents/personas";

export interface CallingJob {
  key: string;
  label: string;
  description: string;
  persona: PersonaKey;
  /** Pre-ticked in the permissions step. Must be a subset of the persona's own allowlist. */
  suggestedTools: string[];
}

export const CALLING_JOBS: CallingJob[] = [
  {
    key: "call_new_leads",
    label: "Call new leads",
    description: "Ring people who just enquired, find out what they need, and get them to a next step.",
    persona: "sales",
    suggestedTools: ["update_lead", "check_availability", "create_appointment", "escalate_to_human"],
  },
  {
    key: "qualify_prospects",
    label: "Qualify prospects",
    description: "Work out who's serious and who isn't, so your team only spends time on real buyers.",
    persona: "sales",
    suggestedTools: ["update_lead", "escalate_to_human"],
  },
  {
    key: "follow_up",
    label: "Follow up with customers",
    description: "Check back with people who went quiet or bought earlier.",
    persona: "sales",
    suggestedTools: ["update_lead", "check_availability", "create_appointment", "escalate_to_human"],
  },
  {
    key: "book_appointments",
    label: "Book appointments",
    description: "Get people booked into your calendar without your team playing phone tag.",
    persona: "sales",
    suggestedTools: ["check_availability", "create_appointment", "update_lead", "escalate_to_human"],
  },
  {
    key: "customer_support",
    label: "Handle customer support",
    description: "Answer questions, check on orders, and log problems so nothing gets lost.",
    persona: "support",
    suggestedTools: ["check_order_status", "log_complaint", "escalate_to_human", "update_lead"],
  },
  {
    key: "answer_enquiries",
    label: "Answer general enquiries",
    description: "Pick up when people call in, answer what you can, and take a message when you can't.",
    persona: "receptionist",
    suggestedTools: ["check_availability", "create_appointment", "check_order_status", "escalate_to_human"],
  },
];

export function getJob(key: string): CallingJob | undefined {
  return CALLING_JOBS.find((j) => j.key === key);
}

/**
 * The tools a job may offer, intersected with what its persona
 * actually permits. The intersection is the point: a job definition
 * can never widen a persona's grant, so adding a job later can't
 * accidentally hand out a capability the persona was designed to
 * withhold (the sales persona's lack of request_refund, for example).
 */
export function resolveJobTools(job: CallingJob): string[] {
  const allowed = AGENT_PERSONAS[job.persona].callTools;
  return job.suggestedTools.filter((t) => allowed.includes(t));
}

// Customer-facing labels for the permissions step. Deliberately
// describes what the employee DOES, never the tool name.
export const TOOL_LABELS: Record<string, { label: string; detail: string }> = {
  check_availability: { label: "Check your calendar", detail: "See when you're actually free before offering a time" },
  create_appointment: { label: "Book appointments", detail: "Put a confirmed booking straight into your calendar" },
  update_lead: { label: "Update customer records", detail: "Save what it learns — budget, interest, what they said" },
  check_order_status: { label: "Look up orders", detail: "Tell a customer where their order is" },
  escalate_to_human: { label: "Pass to your team", detail: "Promise a callback when it can't help" },
  log_complaint: { label: "Log complaints", detail: "Record a problem so your team can follow up" },
  request_refund: { label: "Request a refund", detail: "Raise a refund request — always needs your approval before money moves" },
};

// Communication style options for the behaviour step. Mapped into the
// existing custom_call_instructions free text rather than a new
// column — that field already exists and already reaches the prompt.
export const TONE_OPTIONS: { key: string; label: string; instruction: string }[] = [
  { key: "professional", label: "Professional", instruction: "Speak formally and precisely. Keep it businesslike." },
  { key: "friendly", label: "Friendly", instruction: "Speak warmly and casually, like a helpful person rather than a company." },
  { key: "direct", label: "Direct", instruction: "Get to the point quickly. Don't over-explain or pad the conversation." },
];

export const LANGUAGE_OPTIONS: { key: string; label: string; instruction: string }[] = [
  { key: "english", label: "English", instruction: "Speak in English." },
  { key: "hindi", label: "Hindi", instruction: "Speak in Hindi." },
  { key: "hinglish", label: "Hinglish", instruction: "Speak in natural Hinglish — mix Hindi and English the way people actually talk in Indian cities." },
];
