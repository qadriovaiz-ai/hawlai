// Paid Advertising Planning Agent — for the 5 platforms without a
// real API integration yet (Google, LinkedIn, TikTok, Snapchat,
// Pinterest Ads — each needs its own platform approval process, see
// the Integrations page). Meta Ads already has a full real
// integration (Ads Manager: live campaign launch, budget, ROAS) and
// isn't duplicated here. Creative Generation isn't a task here either
// — it links out to the Graphic Design page instead of a second image
// generator. Same flexible-generator pattern as the other toolkits.

import { AD_PLATFORMS, AD_TASKS, type AdPlatformMeta, type AdTaskMeta } from "@/lib/departments/paidAds";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { AD_PLATFORMS, AD_TASKS };
export type { AdPlatformMeta, AdTaskMeta };




import { getModel } from "../models";
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "../claims/businessFacts";
import { guardGenerated } from "../claims/claimCheck";
import { callClaude, withAiFailure, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";
import { guardOrMark, truthBlock } from "@/lib/claims/factsGate";

// Tasks whose output is copy a customer will read. Only these are
// claims-checked; the rest are advice to the owner, where a sentence about
// "a ₹500/day test budget" isn't a price claim.
const CUSTOMER_COPY_TASKS = new Set(["ad_copy"]);

interface BrandProfile {
  tone_of_voice?: string | null;
}

export async function generateAdPlan(
  platformKey: string,
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  performanceContext?: string | null,
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). Ad copy is written from them and checked against them. */
  facts?: BusinessFacts | null
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[] ; _cause?: string; _detail?: string; _malformed?: boolean }> {
  const platform = AD_PLATFORMS.find((p) => p.key === platformKey);
  const task = AD_TASKS.find((t) => t.key === taskKey);
  if (!platform || !task) return { output: { text: "Unknown platform or task." }, _fallback: true };

  const fallback = {
    output: { text: aiFailureMessage("bad_request") },
    _fallback: true,
  };

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 1800,
      messages: [{
        role: "user",
        content: `You are a paid advertising strategist helping an Indian ${businessCategory} business called "${dealershipName}" plan for ${platform.label}. This platform isn't connected to any ad account yet — this is planning content the dealer will use manually or hand to whoever sets up the account.
${brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : ""}${groundingContext ?? ""}${truthBlock(facts)}
${performanceContext ? `\nReal performance from campaigns already run (use this to ground budget/targeting advice in what's actually working, not generic guesses):\n${performanceContext}` : ""}

Task: ${task.label}
Requirements: ${task.instructions(platform.label)}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly. Be accurate to how ${platform.label} actually works (real format names, real limits) — never invent platform features that don't exist, and never invent fake performance statistics.`,
      }],
    }, { operation: "paid_ads_plan", logContext });
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
      console.error(`[paidAdsAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      // F-22: the fallback used to go back as a plain `_fallback` whose
      // output was a sentence, and the chat then had to notice it was
      // not copy. The parser's own account travels with it now, so the
      // chat can say what actually happened instead of guessing
      // (the system prompt's `_cause` / `_detail` rule).
      return { ...fallback, _cause: parsedReply.cause, _detail: parsedReply.detail, _malformed: true };
    }
    const parsed = parsedReply.value;
    // Ad copy is what a customer reads: invented offers, prices and
    // claims are removed (an unverified price is kept and flagged — the
    // owner reviews this before using it), and the note goes on the result.
    // A task that isn't customer copy is left alone, as before. A
    // customer-facing one is always checked — F-01: missing facts used
    // to take the same exit as "not customer copy".
    if (!CUSTOMER_COPY_TASKS.has(taskKey)) return { output: parsed };
    const guarded = guardOrMark(parsed, facts, "draft");
    return { output: guarded.output, claimsRemoved: guarded.removed };
  } catch (err: any) {
    console.error("[paid-ads-agent] error:", err.message);
    return fallback;
  }
}
