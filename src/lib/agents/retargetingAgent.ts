// ------------------------------------------------------------------
// Retargeting Ad Copy Agent
// ------------------------------------------------------------------
// Honest scope: this generates ad copy and tells the dealer exactly
// how to set the audience up in Meta/Google Ads Manager (via a real
// customer-list CSV export) — it doesn't auto-launch anything or
// auto-sync a live pixel, since that needs Meta Ads API access this
// account doesn't have working yet. What it produces is fully real
// and immediately usable by hand.
// ------------------------------------------------------------------

import { logClaudeUsage } from "../usage/logUsage";
import { getModel, CLAUDE_MODELS } from "../models";

export interface RetargetingCopy {
  headline: string;
  primaryText: string;
  cta: string;
  variant2Headline: string;
  variant2PrimaryText: string;
}

const SEGMENT_PROMPTS: Record<string, (ctx: string) => string> = {
  abandoned_cart: (ctx) => `An Indian business's customers added items to their cart but didn't check out. Context: ${ctx}
Write a retargeting ad (for Meta/Google) that reminds them what they left behind and gives a gentle, non-desperate nudge to complete the purchase. Assume a small discount or free shipping might be offered — mention it generically ("a little something extra") without inventing a specific number.`,
  cold_lead: (ctx) => `An Indian business has leads who showed interest but went cold (no response in a while). Context: ${ctx}
Write a retargeting/re-engagement ad that re-introduces the business and creates fresh interest — not a hard sell, more "still thinking about it? here's why now's a good time."`,
  lapsed_buyer: (ctx) => `An Indian business has one-time customers who haven't come back to buy again in a while. Context: ${ctx}
Write a win-back ad that makes them feel remembered and valued, and gives them a reason to return — new arrivals, a loyalty nudge, or simply "we miss you."`,
};

export async function generateRetargetingCopy(
  segmentType: "abandoned_cart" | "cold_lead" | "lapsed_buyer",
  businessName: string,
  category: string,
  segmentContext: string,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string
): Promise<RetargetingCopy> {
  const fallback: RetargetingCopy = {
    headline: `Still thinking about ${businessName}?`,
    primaryText: `We saved this for you — come back and pick up where you left off.`,
    cta: "Shop Now",
    variant2Headline: `${businessName} misses you`,
    variant2PrimaryText: `A little something's waiting for you at ${businessName}.`,
  };

  try {
    const promptBuilder = SEGMENT_PROMPTS[segmentType] ?? SEGMENT_PROMPTS.cold_lead;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getModel("standard"),
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `${promptBuilder(segmentContext)}${groundingContext ?? ""}

Business: ${businessName} (${category})

Respond ONLY with JSON, no markdown fences:
{"headline": "...", "primaryText": "...", "cta": "...", "variant2Headline": "...", "variant2PrimaryText": "..."}`,
          },
        ],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (logContext) {
      await logClaudeUsage(logContext.supabase, logContext.dealershipId, "retargeting_copy", data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0, CLAUDE_MODELS.standard);
    }

    return {
      headline: parsed.headline ?? fallback.headline,
      primaryText: parsed.primaryText ?? fallback.primaryText,
      cta: parsed.cta ?? fallback.cta,
      variant2Headline: parsed.variant2Headline ?? fallback.variant2Headline,
      variant2PrimaryText: parsed.variant2PrimaryText ?? fallback.variant2PrimaryText,
    };
  } catch {
    return fallback;
  }
}
