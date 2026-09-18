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

export interface WhatsappTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

export const WHATSAPP_TASKS: WhatsappTaskMeta[] = [
  { key: "broadcast", label: "Broadcast Message", instructions: "A short broadcast-style WhatsApp message (under 300 characters) for an announcement or update, using WhatsApp formatting (*bold*, _italic_ where it helps), 1-2 relevant emoji, ends with a clear next step. Return {message}." },
  { key: "chatbot_flow", label: "AI Chatbot Flow", instructions: "A WhatsApp chatbot conversation flow script for handling common inbound questions for this business: return {flow: [{trigger, response}]} — 6 common triggers (e.g. 'pricing', 'hours', 'location', greeting) each with the exact response text the bot/agent should send." },
  { key: "follow_up", label: "Follow-up Message", instructions: "A WhatsApp follow-up message for a lead who hasn't replied, casual and low-pressure, under 200 characters, gives an easy out. Return {message}." },
  { key: "order_update", label: "Order Update", instructions: "A WhatsApp order/booking status update message, clear and reassuring, under 200 characters, includes a placeholder like {status} or {date} where the real detail would be inserted. Return {message}." },
  { key: "promotion", label: "Promotion", instructions: "A WhatsApp promotional message, under 250 characters, WhatsApp formatting, clear CTA. Feature an offer only if the facts list an active one (use its code and terms exactly); otherwise promote the product itself. Return {message}." },
  { key: "cart_recovery", label: "Cart Recovery", instructions: "A WhatsApp message for someone who showed interest but didn't follow through, gentle nudge addressing likely hesitation, under 200 characters, soft CTA. Return {message}." },
  { key: "lead_nurturing", label: "Lead Nurturing Sequence", instructions: "A 3-message WhatsApp nurture sequence for a warm lead, each message short (under 150 characters) with a distinct angle (value, trust built only from real facts, gentle CTA), meant to be sent a few days apart. Return {messages: [{step, message}]}." },
];

interface BrandProfile {
  tone_of_voice?: string | null;
}

import { CLAUDE_MODELS } from "../models";
import { modelForTask } from "../aiTaskRouter";
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "@/lib/claims/businessFacts";
import { guardGenerated, type ClaimsMode } from "@/lib/claims/claimCheck";
import { WHATSAPP_RULES, addWhatsappOptOut } from "@/lib/expertise/channelRules";
import { resolveFestiveTopic } from "@/lib/expertise/seasonalCalendar";
import { callClaude, withAiFailure, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";

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
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; priceWarnings?: string[] }> {
  const meta = WHATSAPP_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { message: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { message: aiFailureMessage("bad_request") },
    _fallback: true,
  };

  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it warm and conversational, like a real person texting.";

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
${brandContext}${groundingContext ?? ""}${facts ? `\n\n${formatFactsForCopy(facts)}\n\n${COPY_TRUTH_RULES}\n` : ""}
${WHATSAPP_RULES}

Topic/context: "${resolveFestiveTopic(topic, facts?.season) || "general, use good judgement for this business type"}"

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. WhatsApp messages should read like a real person texting, not a formal email — short sentences, no corporate language. Match the field names implied above exactly.`,
      }],
    }, { operation: "whatsapp_generation", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    // The opt-out line goes on after the claims check, so it can never
    // be stripped as a "claim", and on in code so it's never forgotten.
    if (!facts) return { output: addWhatsappOptOut(taskKey, parsed) };
    // Sentences making claims the facts don't support are removed, and
    // the owner is told (output._claimsNote) — never silently kept.
    const guarded = guardGenerated(parsed, facts, claimsMode);
    return { output: addWhatsappOptOut(taskKey, guarded.output), claimsRemoved: guarded.removed, priceWarnings: guarded.priceWarnings };
  } catch (err: any) {
    console.error("[whatsapp-marketing-agent] error:", err.message);
    return fallback;
  }
}
