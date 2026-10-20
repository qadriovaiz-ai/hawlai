// WhatsApp Marketing Agent — Broadcasts, AI Chatbot (flow script, not
// live — see note below), Follow-ups, Order Updates, Promotions, Cart
// Recovery, Lead Nurturing. Hawlai doesn't use the paid WhatsApp
// Business API (see /dashboard/whatsapp), so every task here produces
// WhatsApp-ready message text for the existing free click-to-send
// flow — no bulk/automated sending, which would also risk a personal
// WhatsApp number getting banned for spam-like behavior.
//
// "AI Chatbot" specifically: a real inbound auto-responding chatbot
// needs the paid WhatsApp Business API to receive messages via
// webhook. Without that, this generates a CONVERSATION FLOW SCRIPT —
// the question tree / responses a dealer (or their WhatsApp Business
// API provider, if they get one later) would use — not a live bot.

import { WHATSAPP_TASKS, type WhatsappTaskMeta } from "@/lib/departments/whatsapp";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { WHATSAPP_TASKS };
export type { WhatsappTaskMeta };


interface BrandProfile {
  tone_of_voice?: string | null;
}

import { CLAUDE_MODELS } from "../models";
import { soundRule, normaliseLanguage } from "@/lib/content/language";
import { modelForTask } from "../aiTaskRouter";
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "@/lib/claims/businessFacts";
import { guardGenerated, type ClaimsMode } from "@/lib/claims/claimCheck";
import { WHATSAPP_RULES, addWhatsappOptOut } from "@/lib/expertise/channelRules";
import { resolveFestiveTopic } from "@/lib/expertise/seasonalCalendar";
import { aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";
// Every piece of copy on this surface goes through the one door.
import { generateCopy } from "@/lib/content/generateCopy";

export async function generateWhatsappContent(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). When given, copy is written from them and checked against them. */
  facts?: BusinessFacts | null,
  /** "draft" when the owner reviews this before it's used: unverified prices are flagged, not removed. */
  claimsMode: ClaimsMode = "publish"
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; priceWarnings?: string[]; substantiation?: string[]; publishable?: boolean; _cause?: string; _detail?: string; _malformed?: boolean; _incomplete?: boolean }> {
  const meta = WHATSAPP_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { message: "Unknown task type." }, _fallback: true, _incomplete: true };

  const fallback = {
    output: { message: aiFailureMessage("bad_request") },
    _fallback: true,
  };

  // WhatsApp never carried the owner's language setting at all.
  const brandContext = [
    brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it warm and conversational, like a real person texting.",
    soundRule(normaliseLanguage((brandProfile as any)?.preferred_language ?? facts?.brand?.language), brandProfile?.tone_of_voice),
  ].join("\n");

  try {
    // PHASE 3.5, STEP 4. WhatsApp had claims and provenance; through the
    // door it also gets the customer-first structure, the anti-generic
    // verdict, the invented-key strip and the new claim classes. The
    // opt-out line and the Haiku routing stay here - both are WhatsApp's
    // own.
    const copy = await generateCopy({
      topic,
      businessName: dealershipName,
      businessCategory,
      facts,
      mode: claimsMode,
      revise: claimsMode === "draft",
      language: (brandProfile as any)?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "whatsapp_generation",
      // S2a: the second surface on the fact-bound pipeline. Does nothing
      // unless FACT_BOUND_COPY=1 is also set. The opt-out line is added
      // AFTER the door (addWhatsappOptOut below), so no check can drop
      // it; whatsappOptOut.test.ts pins that.
      factBound: true,
      task: "whatsapp",
      logContext,
      // Haiku — short WhatsApp copy (broadcasts, follow-ups, cart
      // recovery) is a lower-complexity linguistic task than most of
      // what this app uses Sonnet for. Routed through the AI Task
      // Router by taskKey (Usage/Pricing spec Section 10).
      model: modelForTask(taskKey),
      maxTokens: 1600,
      brief: {
        label: meta.label,
        instructions: meta.instructions,
        channelRules: WHATSAPP_RULES,
        brandContext: `You are writing WhatsApp messages.
${brandContext}`,
        grounding: groundingContext ?? undefined,
        shapeHint: `Return JSON only, no markdown, no preamble. WhatsApp messages should read like a real person texting, not a formal email — short sentences, no corporate language. Match the field names implied above exactly.`,
      },
    });
    // copy.output, NOT the generic fallback: the door already put
    // the SPECIFIC failure message in it, and
    // tests/aiFailureRest.test.ts asserts the owner reads that
    // rather than "something went wrong".
    // _incomplete TRAVELS OUT, so a caller can tell "nothing was
    // written" from "something was written badly". The email surface has
    // done this since 2026-10-16, when an eval read five
    // unreachable-model cases as fine because nothing threw.
    //
    // THIS SURFACE DID NOT, and the eighth S2a run of 2026-10-20 paid
    // for it: dairy-10 failed closed, its message was "Something went
    // wrong writing this - try again", and the run printed "CASES THAT
    // WROTE NOTHING 0 of 6" and offered itself for grading. I wired
    // this surface into the eval and copied the email case's reading of
    // _incomplete without giving this agent anything to read. The
    // founder's rule from 2026-10-16 - an incomplete run must never
    // read as a clean one - was implemented on one surface only.
    if (copy._aiFailure) return { output: copy.output, _fallback: true, _aiFailure: copy._aiFailure, _incomplete: copy.incomplete === true };
    if (copy._malformed) return { ...fallback, _cause: copy._cause, _detail: copy._detail, _malformed: true };
    if (copy.incomplete) return { output: copy.output, _fallback: true, _incomplete: true };
    if (copy._fallback) return { ...fallback, _incomplete: true };
    // The opt-out line goes on AFTER the claims check, so it can never
    // be stripped as a "claim", and on in code so it is never forgotten.
    return {
      output: addWhatsappOptOut(taskKey, copy.output),
      claimsRemoved: copy.removed,
      priceWarnings: copy.priceWarnings,
      substantiation: copy.substantiation,
      publishable: copy.publishable,
    };
  } catch (err: any) {
    console.error("[whatsapp-marketing-agent] error:", err.message);
    return { ...fallback, _incomplete: true };
  }
}
