// The rules of the road for email and WhatsApp marketing — what every
// email and WhatsApp generator, and chat, writes under.
//
// Worded as practice, not legal citation: India has no email-specific
// anti-spam statute; the DPDP Act 2023 governs using people's personal
// data (email addresses and numbers included) with its obligations
// phasing in; what's enforced day to day is Gmail/Yahoo's sender
// requirements (authentication, one-click unsubscribe, low complaints)
// and Meta's WhatsApp Business policy. Where a rule can be checked in
// code it is — misleading subjects here, the WhatsApp opt-out line in
// the generator — rather than left to the prompt.

import { senderDisplayName } from "@/lib/email/resendClient";

export const EMAIL_RULES = `EMAIL RULES — follow every one:
- The sender is this business, under its real name. Never pose as a person the business isn't, or as a bank, courier, marketplace, government body or Hawlai.
- The subject line says what's actually inside. No fake "Re:" or "Fwd:", no pretend order, invoice, payment, delivery, account or security notice on a marketing email, and no clickbait the email doesn't deliver.
- Write only for people who gave this business their email — a signup, a purchase, an enquiry. Never write as if to a bought or scraped list.
- Never invent an unsubscribe link or a postal address; Hawlai adds the footer.
- Never ask for sensitive personal details (ID numbers, bank or card details, passwords) by email.
- Short and scannable: one idea, one clear call to action.`;

export const WHATSAPP_RULES = `WHATSAPP RULES (Meta's WhatsApp Business policy) — follow every one:
- Write only for people who have messaged this business or agreed to hear from it on WhatsApp. Never suggest messaging numbers that haven't opted in, or bought lists.
- Hawlai drafts WhatsApp messages for the owner to send by hand. Never say or imply a message will go out automatically or in bulk.
- Marketing messages (offers, promotions, broadcasts, cart reminders, nurture sequences) tell people how to opt out. Hawlai adds that line — don't add another.
- No false urgency; one clear next step.`;

/** What chat needs to answer an owner's questions about these channels correctly, on top of the writing rules. */
export const CHANNEL_POLICY_FOR_CHAT = `${EMAIL_RULES}

${WHATSAPP_RULES}

How WhatsApp sending works, if the owner asks:
- Meta requires opt-in before any marketing message.
- Within 24 hours of a customer's last message to the business, normal replies are allowed. Outside that window only Meta-approved template messages can be sent; free-form messages are blocked.
- Templates are Marketing, Utility or Authentication — each approved separately by Meta, with its own rules and pricing. Marketing templates need a visible opt-out.
- Breaking these rules gets a number flagged, restricted or banned. That's why Hawlai keeps WhatsApp as tap-to-send until proper template-based sending is built — say so plainly rather than promising automatic WhatsApp sends.
- Email: consent (people gave the business their email) and honouring unsubscribes straight away are the business's responsibility under India's DPDP Act 2023; for the exact legal position the owner should ask a lawyer.`;

const FAKE_THREAD = /^\s*(?:(?:re|fwd?|fw)\s*:\s*)+/i;
const IMPERSONATION: [RegExp, string][] = [
  [/\byour\s+(?:order|invoice|receipt|payment|refund|delivery|parcel|package|shipment|account|booking)\b/i, "reads like a notice about the customer's order, payment or account"],
  [/\b(?:order|payment|delivery)\s+(?:confirmed|received|failed|declined|pending|delayed|update)\b/i, "reads like an order or payment notice"],
  [/\b(?:invoice|receipt)\s*(?:#|no\.?|number)?\s*\d/i, "reads like an invoice or receipt"],
  [/\b(?:account|password|security)\s+(?:alert|suspended|locked|verification|verify|reset|notice)\b/i, "reads like an account or security notice"],
  [/\b(?:final|last)\s+(?:notice|warning|reminder)\b/i, "reads like a formal final notice"],
];

/** Why a marketing subject line misleads about what's inside, or null. */
export function misleadingSubject(subject: string | null | undefined): string | null {
  const s = String(subject ?? "");
  if (FAKE_THREAD.test(s)) return 'starts with "Re:" or "Fwd:" — it isn\'t a reply or forward';
  for (const [re, why] of IMPERSONATION) if (re.test(s)) return why;
  return null;
}

/**
 * A subject that tells the truth: a fake "Re:"/"Fwd:" is simply dropped;
 * one that still misleads is replaced with a plain one from the business.
 */
export function honestSubject(subject: string, businessName: string): { subject: string; problem: string | null } {
  const problem = misleadingSubject(subject);
  if (!problem) return { subject, problem: null };
  const stripped = subject.replace(FAKE_THREAD, "").trim();
  if (stripped && !misleadingSubject(stripped)) return { subject: stripped, problem };
  return { subject: `A note from ${senderDisplayName(businessName)}`, problem };
}

/** Fixes every subject in a generated email output (single email or a sequence); returns what was wrong. */
export function fixSubjects(output: any, businessName: string): string[] {
  const problems: string[] = [];
  const fix = (holder: any) => {
    if (!holder || typeof holder.subject !== "string") return;
    const { subject, problem } = honestSubject(holder.subject, businessName);
    if (problem) {
      problems.push(`Subject "${holder.subject}" ${problem} — changed to "${subject}".`);
      holder.subject = subject;
    }
  };
  fix(output);
  if (Array.isArray(output?.emails)) output.emails.forEach(fix);
  return problems;
}

/** WhatsApp tasks Meta would class as marketing — these carry an opt-out line. */
export const WHATSAPP_MARKETING_TASKS = new Set(["broadcast", "promotion", "cart_recovery", "lead_nurturing"]);

export const WHATSAPP_OPT_OUT = "Reply STOP to stop these messages.";

const HAS_OPT_OUT = /\b(?:reply|send|text|type)\s+\*?stop\*?\b/i;

function withOptOut(message: unknown): unknown {
  if (typeof message !== "string" || !message.trim()) return message;
  return HAS_OPT_OUT.test(message) ? message : `${message.trimEnd()}\n\n${WHATSAPP_OPT_OUT}`;
}

/** Adds the opt-out line to every message a marketing WhatsApp task produced. */
export function addWhatsappOptOut(taskKey: string, output: any): any {
  if (!WHATSAPP_MARKETING_TASKS.has(taskKey) || !output || typeof output !== "object") return output;
  const next = { ...output };
  if ("message" in next) next.message = withOptOut(next.message);
  if (Array.isArray(next.messages)) next.messages = next.messages.map((m: any) => (m && typeof m === "object" ? { ...m, message: withOptOut(m.message) } : m));
  return next;
}
