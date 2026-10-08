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
import { soundRule, normaliseLanguage } from "@/lib/content/language";
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "@/lib/claims/businessFacts";
import { guardGenerated, claimsNote, priceWarningNote, type ClaimsMode } from "@/lib/claims/claimCheck";
import { EMAIL_RULES, fixSubjects } from "@/lib/expertise/channelRules";
import { resolveFestiveTopic } from "@/lib/expertise/seasonalCalendar";
import { composeMarketingEmail, type ComposedEmail } from "@/lib/email/composeEmail";

import { EMAIL_TASKS, type EmailTaskMeta } from "@/lib/departments/email";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { EMAIL_TASKS };
export type { EmailTaskMeta };

// The tasks that produce one customer-facing email, sent as the visual
// template (lib/email/composeEmail.ts). The rest produce several emails
// or advice for the owner.
export const VISUAL_EMAIL_TASKS = new Set(["welcome_email", "abandoned_cart", "promotional", "newsletter", "follow_up"]);


interface BrandProfile {
  tone_of_voice?: string | null;
}

import { callClaude, aiFailureMessage, aiFailureNote, type AiFailureNote } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";
import { guardOrMark, truthBlock } from "@/lib/claims/factsGate";

export async function generateEmailContent(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). When given, copy is written from them and checked against them. */
  facts?: BusinessFacts | null,
  /** "draft" when the owner reviews this before it's sent: unverified prices are flagged, not removed. Automation never passes it. */
  claimsMode: ClaimsMode = "publish"
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; priceWarnings?: string[]; email?: ComposedEmail ; _cause?: string; _detail?: string; _malformed?: boolean }> {
  const meta = EMAIL_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = { output: { text: aiFailureMessage("bad_request") }, _fallback: true };

  // Email never carried the owner's language setting at all.
  const brandContext = [
    brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it warm, direct, and specific to the business.",
    soundRule(normaliseLanguage((brandProfile as any)?.preferred_language ?? facts?.brand?.language), brandProfile?.tone_of_voice),
  ].join("\n");

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are an email marketer writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}${truthBlock(facts)}
${EMAIL_RULES}

Topic/context: "${resolveFestiveTopic(topic, facts?.season) || "general, use good judgement for this business type"}"

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly. Write real, specific email copy — never generic filler like "check out our amazing products".`,
      }],
    }, { operation: "email_generation", logContext });
    if (!r.ok) return { output: { text: aiFailureMessage(r.failure.kind) }, _fallback: true, _aiFailure: aiFailureNote(r.failure) };
    const text = r.text;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[emailMarketingAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      // F-22: the fallback used to go back as a plain `_fallback` whose
      // output was a sentence, and the chat then had to notice it was
      // not copy. The parser's own account travels with it now, so the
      // chat can say what actually happened instead of guessing
      // (the system prompt's `_cause` / `_detail` rule).
      return { ...fallback, _cause: parsedReply.cause, _detail: parsedReply.detail, _malformed: true };
    }
    const parsed = parsedReply.value;
    // A subject that misleads about what's inside is fixed in code, not
    // left to the prompt — and counts as a removed claim, so automation
    // (which sends only untouched emails) regenerates instead of sending.
    const subjectProblems = fixSubjects(parsed, dealershipName);
    const subjectNote = subjectProblems.length ? `Hawlai changed the subject line so it doesn't mislead: ${subjectProblems.join(" ")}` : null;
    // F-01: with no facts this used to return the draft unguarded and
    // unmarked. guardOrMark runs the fact-independent subset instead and
    // says which state it was in (src/lib/claims/factsGate.ts).
    const guarded = guardOrMark(parsed, facts, claimsMode);
    const removed = [...guarded.removed, ...subjectProblems];
    const output: any = guarded.output;
    const note = [claimsNote(guarded.removed), priceWarningNote(guarded.priceWarnings), subjectNote].filter(Boolean).join(" ");
    if (note) output._claimsNote = note;
    // The finished visual email, built from the checked words and the
    // real links, photo and brand. Returned beside the output, never
    // inside it — the output is saved and shown as the editable draft.
    // No facts, no visual email: the composer builds it from the real
    // links, photo and brand, and there is nothing to build from. The
    // words still come back, marked unverified by the gate above.
    const email = facts && VISUAL_EMAIL_TASKS.has(taskKey) ? composeMarketingEmail(output, facts) : undefined;
    return { output, claimsRemoved: removed, priceWarnings: guarded.priceWarnings, email };
  } catch (err: any) {
    console.error("[email-marketing-agent] error:", err.message);
    return fallback;
  }
}
