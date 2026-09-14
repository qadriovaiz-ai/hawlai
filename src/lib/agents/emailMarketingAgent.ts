// Email Marketing Agent — covers 7 of the 9 requested tasks as
// content generation: Welcome Emails, Abandoned Cart, Promotional,
// Newsletter, Sales Sequences, Follow-ups, Personalization tips.
// Segmentation is NOT here — it's a real feature that groups actual
// leads from the database (see api/email/segments), not AI-generated
// fake segments. Analytics is also not a generator — the Gmail
// integration only has send scope (gmail.send), no open/click
// tracking, so real analytics isn't available; the Email page shows
// honest guidance instead of fabricating numbers.

import { getModel } from "../models";
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "@/lib/claims/businessFacts";
import { guardGenerated, claimsNote } from "@/lib/claims/claimCheck";
import { EMAIL_RULES, fixSubjects } from "@/lib/expertise/channelRules";
import { resolveFestiveTopic } from "@/lib/expertise/seasonalCalendar";
import { composeMarketingEmail, type ComposedEmail } from "@/lib/email/composeEmail";

export interface EmailTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

// The tasks that produce one customer-facing email, sent as the visual
// template (lib/email/composeEmail.ts). The rest produce several emails
// or advice for the owner.
const VISUAL = `Return {subject, previewText, headline (under 60 characters), intro (1–2 short sentences), bullets (0–3 short points, only if they help), ctaLabel (2–4 words for the button), product (the exact name of the product it features from the facts, or ""), body (the same message as plain text, under 120 words)}. Never put a link or web address in any field — Hawlai adds the button link.`;
export const VISUAL_EMAIL_TASKS = new Set(["welcome_email", "abandoned_cart", "promotional", "newsletter", "follow_up"]);

export const EMAIL_TASKS: EmailTaskMeta[] = [
  { key: "welcome_email", label: "Welcome Email", instructions: `A welcome email for a new lead/customer — warm, sets expectations for what happens next, no hard sell. ${VISUAL}` },
  { key: "abandoned_cart", label: "Abandoned Cart", instructions: `An abandoned-cart/inquiry follow-up email for someone who showed interest but didn't convert — gentle nudge, addresses likely hesitation, soft call to action to continue. ${VISUAL}` },
  { key: "promotional", label: "Promotional Email", instructions: `A promotional email for an offer or product — if the facts list an active offer, feature it exactly as listed (code and terms); if not, promote the product itself and never invent a discount. Strong call to action. ${VISUAL}` },
  { key: "newsletter", label: "Newsletter", instructions: "A newsletter email: return {subject, previewText, headline (under 60 characters), sections: [{heading, body}], ctaLabel (2–4 words), product (a product name from the facts it spotlights, or \"\"), body (the whole newsletter as plain text)} — 3 short sections (e.g. update, tip, spotlight), each body 1–2 sentences, casual and value-first, not salesy. Never put a link or web address in any field." },
  { key: "sales_sequence", label: "Sales Sequence", instructions: "A 3-email sales sequence for nurturing a warm lead toward a decision: return {emails: [{step, subject, body}]} — each email should have a distinct angle (value, trust built only from real facts — never invented testimonials or numbers — and a clear next step) and escalate naturally." },
  { key: "follow_up", label: "Follow-up Email", instructions: `A follow-up email for a lead who went quiet after initial contact — low-pressure, easy to reply to, gives an easy out ('let me know if now isn't the right time'). ${VISUAL}` },
  { key: "personalization", label: "Personalization Tips", instructions: "5 practical personalization tactics for making emails feel individually written rather than mass-blasted, specific to this business type: return {tips: [{tactic, howTo}]}." },
];

interface BrandProfile {
  tone_of_voice?: string | null;
}

import { logClaudeUsage } from "../usage/logUsage";

export async function generateEmailContent(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). When given, copy is written from them and checked against them. */
  facts?: BusinessFacts | null
): Promise<{ output: any; _fallback?: boolean; claimsRemoved?: string[]; email?: ComposedEmail }> {
  const meta = EMAIL_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: `${meta.label} draft for ${dealershipName}. Regenerate once the API is available for a tailored version.` },
    _fallback: true,
  };

  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it warm, direct, and specific to the business.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: getModel("standard"),
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `You are an email marketer writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}${facts ? `\n\n${formatFactsForCopy(facts)}\n\n${COPY_TRUTH_RULES}\n` : ""}
${EMAIL_RULES}

Topic/context: "${resolveFestiveTopic(topic, facts?.season) || "general, use good judgement for this business type"}"

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly. Write real, specific email copy — never generic filler like "check out our amazing products".`,
        }],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "email_generation", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    // A subject that misleads about what's inside is fixed in code, not
    // left to the prompt — and counts as a removed claim, so automation
    // (which sends only untouched emails) regenerates instead of sending.
    const subjectProblems = fixSubjects(parsed, dealershipName);
    const subjectNote = subjectProblems.length ? `Hawlai changed the subject line so it doesn't mislead: ${subjectProblems.join(" ")}` : null;
    if (!facts) {
      if (subjectNote) parsed._claimsNote = subjectNote;
      return { output: parsed, claimsRemoved: subjectProblems.length ? subjectProblems : undefined };
    }
    // Sentences making claims the facts don't support are removed, and
    // the owner is told (output._claimsNote) — never silently kept.
    const guarded = guardGenerated(parsed, facts);
    const removed = [...guarded.removed, ...subjectProblems];
    const output: any = guarded.output;
    const note = [claimsNote(guarded.removed), subjectNote].filter(Boolean).join(" ");
    if (note) output._claimsNote = note;
    // The finished visual email, built from the checked words and the
    // real links, photo and brand. Returned beside the output, never
    // inside it — the output is saved and shown as the editable draft.
    const email = VISUAL_EMAIL_TASKS.has(taskKey) ? composeMarketingEmail(output, facts) : undefined;
    return { output, claimsRemoved: removed, email };
  } catch (err: any) {
    console.error("[email-marketing-agent] error:", err.message);
    return fallback;
  }
}
