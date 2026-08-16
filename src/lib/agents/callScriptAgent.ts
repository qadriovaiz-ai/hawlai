// Builds a genuinely business-specific calling script — real
// dealership name/category/brand voice and real lead context, not
// the same generic script for every business on the platform.
//
// Deliberately template-based, not an LLM call: this runs on the
// critical path right before a live call starts, and Vapi expects
// the call-creation request to return promptly — adding an extra
// Claude round-trip here risks real call-setup latency for no real
// benefit, since a well-designed template covers this job reliably.

export interface KnowledgeFact {
  category: string;
  title: string;
  content: string;
}

// Shared by both the outbound and inbound prompts — real, owner-entered
// facts (business_knowledge table) are the one thing the AI is allowed
// to state as certain; everything else stays hedged per the "never
// invent" rule below.
function formatKnowledgeFacts(facts?: KnowledgeFact[] | null): string {
  if (!facts || facts.length === 0) return "";
  const lines = facts.map((f) => `- ${f.title}: ${f.content}`).join("\n");
  return `\nReal facts about this business you can state with confidence (only these — don't extend or guess beyond them):\n${lines}\n`;
}

interface CallScriptContext {
  dealershipName: string;
  businessCategory: string;
  toneOfVoice?: string | null;
  leadName: string;
  qualificationReason?: string | null; // from a prior interaction, if any — real context, not invented
  customInstructions?: string | null; // dealerships.custom_call_instructions — owner-written, appended verbatim
  knowledgeFacts?: KnowledgeFact[] | null; // active business_knowledge rows
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

  return `You are calling on behalf of ${ctx.dealershipName}, a ${ctx.businessCategory} business in India. You are speaking with ${ctx.leadName}, who has shown interest in the business.

${toneLine}

${contextLine}
${customLine}${factsBlock}
Your goals on this call:
1. Confirm you're speaking with the right person, briefly and naturally.
2. Understand what they're looking for or what stopped them from moving forward.
3. Answer questions honestly — if you don't have specific product/pricing details, say a team member will follow up with exact information rather than guessing or making up specifics.
4. If they're genuinely interested, offer a clear next step (a callback, a visit, more information sent to them) — don't try to close a sale on this call.
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
