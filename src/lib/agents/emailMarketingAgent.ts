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

import { aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";
// Every piece of copy on this surface goes through the one door.
import { generateCopy } from "@/lib/content/generateCopy";

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
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; priceWarnings?: string[]; substantiation?: string[]; publishable?: boolean; email?: ComposedEmail ; _cause?: string; _detail?: string; _malformed?: boolean }> {
  const meta = EMAIL_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = { output: { text: aiFailureMessage("bad_request") }, _fallback: true };

  // Email never carried the owner's language setting at all.
  const brandContext = [
    brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it warm, direct, and specific to the business.",
    soundRule(normaliseLanguage((brandProfile as any)?.preferred_language ?? facts?.brand?.language), brandProfile?.tone_of_voice),
  ].join("\n");

  try {
    // PHASE 3.5, STEP 1 (2026-10-11). Email is the first surface through
    // generateCopy, and what it gains by going through the door is
    // everything that used to exist only on the Content Marketing path:
    // the customer-first structure, the anti-generic verdict and its
    // retry, the specificity edit, the invented-key strip, and the
    // comparative, performance and benefit rules that now live inside
    // the claims layer. It already had claims and provenance.
    //
    // WHAT THE DOOR DOES NOT TAKE OVER: the subject-line fix and the
    // visual email. Both are email's own and stay here.
    const copy = await generateCopy({
      topic,
      businessName: dealershipName,
      businessCategory,
      facts,
      mode: claimsMode,
      // An email has no platform word cap. Absent from the table is not
      // a cap of zero - see WORD_CAPS.
      revise: claimsMode === "draft",
      language: (brandProfile as any)?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "email_generation",
      logContext,
      brief: {
        label: `${meta.label} (email)`,
        instructions: meta.instructions,
        channelRules: EMAIL_RULES,
        brandContext: `You are an email marketer.\n${brandContext}`,
        grounding: groundingContext ?? undefined,
      },
    });
    if (copy._aiFailure) return { output: copy.output, _fallback: true, _aiFailure: copy._aiFailure };
    if (copy._malformed) return { ...fallback, _cause: copy._cause, _detail: copy._detail, _malformed: true };
    if (copy._fallback) return fallback;

    const parsed = copy.output;
    // A subject that misleads about what's inside is fixed in code, not
    // left to the prompt — and counts as a removed claim, so automation
    // (which sends only untouched emails) regenerates instead of sending.
    //
    // Runs AFTER the door because the door is what produced the subject,
    // and fixSubjects edits in place.
    const subjectProblems = fixSubjects(parsed, dealershipName);
    const subjectNote = subjectProblems.length ? `Hawlai changed the subject line so it doesn't mislead: ${subjectProblems.join(" ")}` : null;
    const removed = [...copy.removed, ...subjectProblems];
    const output: any = parsed;
    // The claims note is already composed inside the guard, in priority
    // order. Only the subject fix is email's to add.
    if (subjectNote) output._claimsNote = [output._claimsNote, subjectNote].filter(Boolean).join(" ");
    // The finished visual email, built from the checked words and the
    // real links, photo and brand. Returned beside the output, never
    // inside it — the output is saved and shown as the editable draft.
    // No facts, no visual email: the composer builds it from the real
    // links, photo and brand, and there is nothing to build from. The
    // words still come back, marked unverified by the gate above.
    const email = facts && VISUAL_EMAIL_TASKS.has(taskKey) ? composeMarketingEmail(output, facts) : undefined;
    return { output, claimsRemoved: removed, priceWarnings: copy.priceWarnings, substantiation: copy.substantiation, publishable: copy.publishable, email };
  } catch (err: any) {
    console.error("[email-marketing-agent] error:", err.message);
    return fallback;
  }
}
