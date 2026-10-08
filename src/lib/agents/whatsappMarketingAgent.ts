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
import { callClaude, withAiFailure, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";
import { guardOrMark, truthBlock } from "@/lib/claims/factsGate";

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
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; priceWarnings?: string[] ; _cause?: string; _detail?: string; _malformed?: boolean }> {
  const meta = WHATSAPP_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { message: "Unknown task type." }, _fallback: true };

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
    const r = await callClaude({
      // Haiku — short WhatsApp copy (broadcasts, follow-ups, cart
      // recovery) is a lower-complexity linguistic task than most
      // of what this app uses Sonnet for. Routed through the AI
      // Task Router by taskKey (Usage/Pricing spec Section 10) —
      // every WHATSAPP_TASKS key maps to "simple", so this is the
      // same Haiku choice as before, now named rather than hardcoded.
      model: modelForTask(taskKey),
      max_tokens: 1600,
      messages: [{
        role: "user",
        content: `You are writing WhatsApp messages for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}${truthBlock(facts)}
${WHATSAPP_RULES}

Topic/context: "${resolveFestiveTopic(topic, facts?.season) || "general, use good judgement for this business type"}"

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. WhatsApp messages should read like a real person texting, not a formal email — short sentences, no corporate language. Match the field names implied above exactly.`,
      }],
    }, { operation: "whatsapp_generation", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[whatsappMarketingAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      // F-22: the fallback used to go back as a plain `_fallback` whose
      // output was a sentence, and the chat then had to notice it was
      // not copy. The parser's own account travels with it now, so the
      // chat can say what actually happened instead of guessing
      // (the system prompt's `_cause` / `_detail` rule).
      return { ...fallback, _cause: parsedReply.cause, _detail: parsedReply.detail, _malformed: true };
    }
    const parsed = parsedReply.value;
    // The opt-out line goes on after the claims check, so it can never
    // be stripped as a "claim", and on in code so it's never forgotten.
    // Sentences making claims the facts don't support are removed, and
    // the owner is told (output._claimsNote) — never silently kept.
    // F-01: missing facts used to skip this entirely.
    const guarded = guardOrMark(parsed, facts, claimsMode);
    return { output: addWhatsappOptOut(taskKey, guarded.output), claimsRemoved: guarded.removed, priceWarnings: guarded.priceWarnings };
  } catch (err: any) {
    console.error("[whatsapp-marketing-agent] error:", err.message);
    return fallback;
  }
}
