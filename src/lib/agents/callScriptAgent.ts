// Builds a genuinely business-specific calling script — real
// dealership name/category/brand voice and real lead context, not
// the same generic script for every business on the platform.
//
// Deliberately template-based, not an LLM call: this runs on the
// critical path right before a live call starts, and Vapi expects
// the call-creation request to return promptly — adding an extra
// Claude round-trip here risks real call-setup latency for no real
// benefit, since a well-designed template covers this job reliably.

interface CallScriptContext {
  dealershipName: string;
  businessCategory: string;
  toneOfVoice?: string | null;
  leadName: string;
  qualificationReason?: string | null; // from a prior interaction, if any — real context, not invented
}

export function buildDynamicSystemPrompt(ctx: CallScriptContext): string {
  const toneLine = ctx.toneOfVoice
    ? `Speak in this brand's tone: ${ctx.toneOfVoice}.`
    : `Speak warmly and professionally — this is a small Indian business, not a corporate call center.`;

  const contextLine = ctx.qualificationReason
    ? `What we know from before: ${ctx.qualificationReason}`
    : `This is the first real conversation with this lead.`;

  return `You are calling on behalf of ${ctx.dealershipName}, a ${ctx.businessCategory} business in India. You are speaking with ${ctx.leadName}, who has shown interest in the business.

${toneLine}

${contextLine}

Your goals on this call:
1. Confirm you're speaking with the right person, briefly and naturally.
2. Understand what they're looking for or what stopped them from moving forward.
3. Answer questions honestly — if you don't have specific product/pricing details, say a team member will follow up with exact information rather than guessing or making up specifics.
4. If they're genuinely interested, offer a clear next step (a callback, a visit, more information sent to them) — don't try to close a sale on this call.
5. Keep the call natural and unhurried — this is a real conversation, not a script being read aloud.

If they're not interested, thank them politely and end the call — never pressure someone who says no.
Never invent specific prices, stock availability, or promises about the business you don't actually know — if asked something specific you don't have real information for, say a team member will call back with exact details.`;
}

export function buildFirstMessage(dealershipName: string, leadName: string): string {
  return `Hi, am I speaking with ${leadName}? I'm calling on behalf of ${dealershipName}.`;
}
