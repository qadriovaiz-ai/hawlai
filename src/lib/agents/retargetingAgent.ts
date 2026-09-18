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
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "../claims/businessFacts";
import { guardGenerated } from "../claims/claimCheck";
import { businessDisplayName } from "../business/displayName";

// THE BUG (2026-09-18): the abandoned-cart prompt told the model to
// "assume a small discount or free shipping might be offered — mention it
// generically". That is an invented offer, in an ad, under the owner's
// name. The copy also ran with no business facts and no claims check, and
// the fallback said "A little something's waiting for you" — a gift that
// doesn't exist. Now: written from the facts, an offer only if the store
// has a live one, and checked by the same guard as every other copy.

export interface RetargetingCopy {
  headline: string;
  primaryText: string;
  cta: string;
  variant2Headline: string;
  variant2PrimaryText: string;
  /** What the claims check removed or wants checked — shown on the result. */
  _claimsNote?: string;
}

const SEGMENT_PROMPTS: Record<string, (ctx: string) => string> = {
  abandoned_cart: (ctx) => `An Indian business's customers added items to their cart but didn't check out. Context: ${ctx}
Write a retargeting ad (for Meta/Google) that reminds them what they left behind and gives a gentle, non-desperate nudge to complete the purchase. Mention a discount, free shipping or any other offer ONLY if the verified facts list it as an active offer — otherwise give them a reason to come back that's about the product itself. Never hint at "something extra" that doesn't exist.`,
  cold_lead: (ctx) => `An Indian business has leads who showed interest but went cold (no response in a while). Context: ${ctx}
Write a retargeting/re-engagement ad that re-introduces the business and creates fresh interest — not a hard sell, more "still thinking about it? here's why now's a good time."`,
  lapsed_buyer: (ctx) => `An Indian business has one-time customers who haven't come back to buy again in a while. Context: ${ctx}
Write a win-back ad that makes them feel remembered and valued, and gives them a reason to return — something real from the facts, or simply "we miss you." No offer, reward or loyalty perk unless the facts list one.`,
};

export async function generateRetargetingCopy(
  segmentType: "abandoned_cart" | "cold_lead" | "lapsed_buyer",
  businessName: string,
  category: string,
  segmentContext: string,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). Copy is written from them and checked against them. */
  facts?: BusinessFacts | null
): Promise<RetargetingCopy> {
  const name = businessDisplayName(businessName);
  // Honest per segment: nothing here promises an offer, and a cold lead
  // or a past buyer isn't told their cart was "saved".
  const FALLBACKS: Record<string, RetargetingCopy> = {
    abandoned_cart: {
      headline: `Still thinking it over?`,
      primaryText: `Your picks from ${name} are a tap away whenever you're ready.`,
      cta: "Shop Now",
      variant2Headline: `Left something behind?`,
      variant2PrimaryText: `Come back to ${name} and finish your order when it suits you.`,
    },
    cold_lead: {
      headline: `Still interested in ${name}?`,
      primaryText: `If you're still looking, we're happy to help — just reply or visit us.`,
      cta: "Learn More",
      variant2Headline: `Questions about ${name}?`,
      variant2PrimaryText: `Ask us anything — we'll help you decide.`,
    },
    lapsed_buyer: {
      headline: `It's been a while`,
      primaryText: `Thanks for choosing ${name} before — here's what we've been making since.`,
      cta: "Shop Now",
      variant2Headline: `${name} misses you`,
      variant2PrimaryText: `Come see what's new at ${name}.`,
    },
  };
  const fallback = FALLBACKS[segmentType] ?? FALLBACKS.cold_lead;

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

Business: ${name} (${category})${facts ? `\n\n${formatFactsForCopy(facts)}\n\n${COPY_TRUTH_RULES}\n` : ""}

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

    const copy: RetargetingCopy = {
      headline: parsed.headline ?? fallback.headline,
      primaryText: parsed.primaryText ?? fallback.primaryText,
      cta: parsed.cta ?? fallback.cta,
      variant2Headline: parsed.variant2Headline ?? fallback.variant2Headline,
      variant2PrimaryText: parsed.variant2PrimaryText ?? fallback.variant2PrimaryText,
    };
    if (!facts) return copy;
    // The owner reviews this before using it: invented claims are removed,
    // an unverified price is kept and flagged. A field emptied by the check
    // falls back to the honest line rather than going out blank.
    const guarded = guardGenerated(copy, facts, "draft");
    const out = guarded.output as RetargetingCopy;
    for (const k of ["headline", "primaryText", "cta", "variant2Headline", "variant2PrimaryText"] as const) {
      if (!String(out[k] ?? "").trim()) out[k] = fallback[k];
    }
    return out;
  } catch {
    return fallback;
  }
}
