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
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[] }> {
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
${brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : ""}${groundingContext ?? ""}${facts ? `\n\n${formatFactsForCopy(facts)}\n\n${COPY_TRUTH_RULES}\n` : ""}
${performanceContext ? `\nReal performance from campaigns already run (use this to ground budget/targeting advice in what's actually working, not generic guesses):\n${performanceContext}` : ""}

Task: ${task.label}
Requirements: ${task.instructions(platform.label)}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly. Be accurate to how ${platform.label} actually works (real format names, real limits) — never invent platform features that don't exist, and never invent fake performance statistics.`,
      }],
    }, { operation: "paid_ads_plan", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    // Ad copy is what a customer reads: invented offers, prices and
    // claims are removed (an unverified price is kept and flagged — the
    // owner reviews this before using it), and the note goes on the result.
    if (!facts || !CUSTOMER_COPY_TASKS.has(taskKey)) return { output: parsed };
    const guarded = guardGenerated(parsed, facts, "draft");
    return { output: guarded.output, claimsRemoved: guarded.removed };
  } catch (err: any) {
    console.error("[paid-ads-agent] error:", err.message);
    return fallback;
  }
}
