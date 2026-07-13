// ------------------------------------------------------------------
// Orchestrator Agent — chains multiple agents for one broad goal
// ------------------------------------------------------------------
// The gap this closes: Master Brain could only do ONE thing per
// request (launch an ad, write a post). A goal like "launch my new
// skincare line" genuinely needs several agents working together —
// strategy, SEO angles, social copy, ad copy variations — compiled
// into one consolidated plan instead of the dealer having to visit
// 4 different pages themselves.
//
// This is a fixed, reliable pipeline rather than a fully dynamic
// planner calling arbitrary agents — more predictable, easier to
// reason about failure modes. Nothing here spends money or publishes
// anything; it only drafts. Turning any of this into a live ad still
// goes through the normal Launch Ad flow (needs a photo, needs
// explicit Launch, needs approval for budget) — this doesn't get a
// shortcut around that.
// ------------------------------------------------------------------

import { generateMarketingStrategy } from "./strategyAgent";
import { generateSeoIdeas } from "./seoAgent";
import { generateSocialCaption } from "./socialMediaAgent";
import { generateCopyVariations } from "./creativeAgent";

export interface OrchestrationResult {
  topic: string;
  strategySummary: string | null;
  seoKeywords: string[];
  socialCaption: string | null;
  adCopyOptions: { headline: string; body: string }[];
  nextStep: string;
}

async function extractTopic(goal: string): Promise<string> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 60,
        messages: [{ role: "user", content: `Extract just the core product/service/topic being launched or promoted from this request, as a short phrase (3-6 words): "${goal}". Return only the phrase, nothing else.` }],
      }),
    });
    const data = await response.json();
    return (data.content?.[0]?.text ?? goal).trim().replace(/^["']|["']$/g, "");
  } catch {
    return goal;
  }
}

export async function runOrchestration(
  goal: string,
  dealershipName: string,
  city: string | null,
  brandProfile: any,
  businessCategory: string
): Promise<OrchestrationResult> {
  const topic = await extractTopic(goal);

  // Run independent steps in parallel where possible.
  const [strategy, seo, caption, copyOptions] = await Promise.all([
    generateMarketingStrategy(dealershipName, city, 15000, `Launch and grow: ${topic}`, brandProfile, businessCategory).catch(() => null),
    generateSeoIdeas(topic, city, businessCategory).catch(() => ({ keywords: [], contentIdeas: [] })),
    generateSocialCaption(topic, brandProfile, businessCategory).catch(() => null),
    generateCopyVariations(topic, brandProfile, 3, businessCategory).catch(() => []),
  ]);

  return {
    topic,
    strategySummary: strategy ? strategy.overview : null,
    seoKeywords: seo.keywords ?? [],
    socialCaption: caption,
    adCopyOptions: (copyOptions ?? []).map((c: any) => ({ headline: c.headline, body: c.body })),
    nextStep: "Review the drafts below, then head to Launch Ad with a photo to get the actual ad live — that step always needs your photo and your final approval before anything goes live or spends money.",
  };
}
