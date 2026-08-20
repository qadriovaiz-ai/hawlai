// Builds a genuinely business-specific calling script — real
// dealership name/category/brand voice and real lead context, not
// the same generic script for every business on the platform.
//
// Deliberately template-based, not an LLM call: this runs on the
// critical path right before a live call starts, and Vapi expects
// the call-creation request to return promptly — adding an extra
// Claude round-trip here risks real call-setup latency for no real
// benefit, since a well-designed template covers this job reliably.

import type { KnowledgeFact } from "../businessBrain";
export type { KnowledgeFact };

// Shared by both the outbound and inbound prompts — real, owner-entered
// facts (business_knowledge table) are the one thing the AI is allowed
// to state as certain; everything else stays hedged per the "never
// invent" rule below.
function formatKnowledgeFacts(facts?: KnowledgeFact[] | null): string {
  if (!facts || facts.length === 0) return "";
  const lines = facts.map((f) => `- ${f.title}: ${f.content}`).join("\n");
  return `\nReal facts about this business you can state with confidence (only these — don't extend or guess beyond them):\n${lines}\n`;
}

// Distinct from qualificationReason (a single field set once at
// qualification time) — this is the growing list of discrete past
// events for this specific lead (prior call outcomes, conversion
// insights), from business_memory.
function formatPastInsights(insights?: string[] | null): string {
  if (!insights || insights.length === 0) return "";
  const lines = insights.map((i) => `- ${i}`).join("\n");
  return `\nWhat's happened with this lead before, from past calls/interactions (real history, weigh it — don't repeat something they already said no to):\n${lines}\n`;
}

interface CallScriptContext {
  dealershipName: string;
  businessCategory: string;
  toneOfVoice?: string | null;
  leadName: string;
  qualificationReason?: string | null; // from a prior interaction, if any — real context, not invented
  pastInsights?: string[] | null; // business_memory rows for this specific lead (P1 4a)
  customInstructions?: string | null; // dealerships.custom_call_instructions — owner-written, appended verbatim
  knowledgeFacts?: KnowledgeFact[] | null; // active business_knowledge rows
  canBookAppointments?: boolean; // true only when the call's assistant config actually declares check_availability/create_appointment — keeps this claim matching real capability rather than assuming tools are always attached
  canUpdateLead?: boolean; // true only when the call's assistant config actually declares update_lead
  canCheckOrders?: boolean; // true only when the call's assistant config actually declares check_order_status
  canEscalate?: boolean; // true only when the call's assistant config actually declares escalate_to_human
  canLogComplaint?: boolean; // true only when the call's assistant config actually declares log_complaint
  canRequestRefund?: boolean; // true only when the call's assistant config actually declares request_refund
}

export function buildDynamicSystemPrompt(ctx: CallScriptContext): string {
  const toneLine = ctx.toneOfVoice
    ? `Speak in this brand's tone: ${ctx.toneOfVoice}.`
    : `Speak warmly and professionally — this is a small Indian business, not a corporate call center.`;

  const contextLine = ctx.qualificationReason
    ? `What we know from before: ${ctx.qualificationReason}`
    : `This is the first real conversation with this lead.`;

  // Owner-written instructions are appended, not blended into the base
  // goals — keeps the safety rules (never invent prices, don't pressure
  // a "no") non-negotiable regardless of what the owner writes here.
  const customLine = ctx.customInstructions?.trim()
    ? `\nAdditional instructions from the business owner (follow these, but never contradict the safety rules below):\n${ctx.customInstructions.trim()}\n`
    : "";

  const factsBlock = formatKnowledgeFacts(ctx.knowledgeFacts);
  const insightsBlock = formatPastInsights(ctx.pastInsights);

  // Only claim the booking capability when it's actually attached to
  // this call's assistant config — see canBookAppointments's doc
  // comment. Deliberately explicit about the check-then-book sequence
  // and the "use the exact value" instruction, since a live tool call
  // that fails still has to leave the conversation in a good state.
  const bookingLine = ctx.canBookAppointments
    ? `\nYou can check real appointment availability and book one directly on this call using your tools — do this whenever the caller wants a next step like a visit or meeting, instead of just saying someone will follow up. Call check_availability first, offer 2-3 of the real times it returns, then call create_appointment with the exact time value the caller picked — never invent or guess a time yourself. If create_appointment says the time isn't available anymore, check availability again and offer a different time rather than telling the caller it's booked.\n`
    : "";

  const updateLeadLine = ctx.canUpdateLead
    ? `\nWhen you learn something concrete about this lead (their budget, what they're interested in, that they're not interested, anything worth a note), use your update_lead tool to save it to the CRM directly during the call, not just in the call summary afterward. Never set their status to "converted" yourself — that decision always stays with a team member.\n`
    : "";

  const orderLookupLine = ctx.canCheckOrders
    ? `\nIf the caller asks about an order they placed, use check_order_status to look up the real status instead of guessing — it matches by their phone number automatically, you don't need to ask for an order number. If it finds nothing or there's no phone on file, say a team member will look into it.\n`
    : "";

  const escalationLine = ctx.canEscalate
    ? `\nIf you're genuinely confused, can't help with what the caller needs, or they explicitly ask to speak to a person, use your escalate_to_human tool — give it a clear, thorough reason so a team member has full context and the caller never has to repeat themselves. This is a callback promise, not a live transfer: after calling it, tell the caller warmly that someone will call them back shortly, thank them, and end the call naturally. Don't keep struggling with something you can't resolve.\n`
    : "";

  const complaintLine = ctx.canLogComplaint
    ? `\nIf the caller raises a complaint — something went wrong, they're unhappy with a product/service/order — use your log_complaint tool to record it in their own specifics, so it's tracked and a team member can follow up. This doesn't end the call; reassure them it's noted and keep going naturally (use escalate_to_human separately if the situation also needs a person right now).\n`
    : "";

  // Money is involved here, so this is deliberately the most explicit
  // and repetitive instruction in the whole prompt — request_refund
  // only ever submits a request for human review, it never moves
  // money. Saying otherwise to a caller would be a real, damaging
  // mistake, not just an inaccuracy.
  const refundLine = ctx.canRequestRefund
    ? `\nIf the caller wants a refund for a specific order, first use check_order_status to find the exact order id, then call request_refund with that id and their reason. This ONLY submits a request for a team member to review — it does NOT process the refund and no money moves. Tell the caller their request has been logged and a team member will review and process it, typically within a few business days. NEVER tell the caller the refund is done, confirmed, approved, or that money has been sent — you have no way of knowing that, and saying it would be wrong.\n`
    : "";

  return `You are calling on behalf of ${ctx.dealershipName}, a ${ctx.businessCategory} business in India. You are speaking with ${ctx.leadName}, who has shown interest in the business.

${toneLine}

${contextLine}
${customLine}${factsBlock}${insightsBlock}${bookingLine}${updateLeadLine}${orderLookupLine}${escalationLine}${complaintLine}${refundLine}
Your goals on this call:
1. Confirm you're speaking with the right person, briefly and naturally.
2. Understand what they're looking for or what stopped them from moving forward.
3. Answer questions honestly — if you don't have specific product/pricing details, say a team member will follow up with exact information rather than guessing or making up specifics.
4. If they're genuinely interested, offer a clear next step (a callback, a visit, more information sent to them, or a booked appointment if you have that tool) — don't try to close a sale on this call.
5. Keep the call natural and unhurried — this is a real conversation, not a script being read aloud.

If they're not interested, thank them politely and end the call — never pressure someone who says no.
Never invent specific prices, stock availability, or promises about the business you don't actually know — if asked something specific you don't have real information for, say a team member will call back with exact details.`;
}

export function buildFirstMessage(dealershipName: string, leadName: string, customFirstMessage?: string | null): string {
  if (customFirstMessage?.trim()) {
    // Owner-written greeting — {leadName} is the one supported
    // placeholder, so a custom greeting can still address the lead by
    // name without the owner needing to write per-lead text.
    return customFirstMessage.trim().replace(/\{leadName\}/gi, leadName);
  }
  return `Hi, am I speaking with ${leadName}? I'm calling on behalf of ${dealershipName}.`;
}

// Inbound calls (someone dialing a business's dedicated number) have no
// known lead identity or qualification history yet — a separate,
// smaller context/prompt pair rather than forcing buildDynamicSystemPrompt's
// outbound-shaped assumptions ("who has shown interest") onto a caller
// who initiated the contact themselves.
interface InboundCallScriptContext {
  dealershipName: string;
  businessCategory: string;
  toneOfVoice?: string | null;
  knowledgeFacts?: KnowledgeFact[] | null;
}

export function buildInboundSystemPrompt(ctx: InboundCallScriptContext): string {
  const toneLine = ctx.toneOfVoice
    ? `Speak in this brand's tone: ${ctx.toneOfVoice}.`
    : `Speak warmly and professionally — this is a small Indian business, not a corporate call center.`;

  const factsBlock = formatKnowledgeFacts(ctx.knowledgeFacts);

  return `You are answering an inbound phone call on behalf of ${ctx.dealershipName}, a ${ctx.businessCategory} business in India. The caller dialed this number themselves — you don't yet know who they are or why they're calling.

${toneLine}
${factsBlock}
Your goals on this call:
1. Greet the caller and ask how you can help, naturally.
2. Understand what they need — a question, a booking, an order, a complaint — before trying to resolve it.
3. Answer honestly — if you don't have specific product/pricing/availability details, say a team member will follow up with exact information rather than guessing or making up specifics.
4. If it's something you can't resolve on the call, take their name and number and confirm someone will call back, rather than leaving them without a next step.
5. Keep the call natural and unhurried — this is a real conversation, not a script being read aloud.

Never invent specific prices, stock availability, or promises about the business you don't actually know — if asked something specific you don't have real information for, say a team member will call back with exact details.`;
}

export function buildInboundFirstMessage(dealershipName: string): string {
  return `Thanks for calling ${dealershipName}, how can I help you today?`;
}
