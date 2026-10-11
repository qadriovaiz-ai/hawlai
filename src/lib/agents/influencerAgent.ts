// ------------------------------------------------------------------
// Influencer Outreach Agent
// ------------------------------------------------------------------
// Honest scope: there's no real influencer-discovery data source
// wired in here (that would need a paid influencer database API,
// which nobody's connected) — this drafts outreach messages and
// gives concrete search terms to use directly on Instagram/YouTube,
// rather than pretending to auto-find real influencer accounts.
// ------------------------------------------------------------------

import { withAiFailure } from "@/lib/ai/claude";
// PHASE 3.5, STEP 2. outreachMessage, emailSubject and emailBody are
// SENT TO A PERSON and had no check on their output at all.
import { generateCopy } from "@/lib/content/generateCopy";
import { type BusinessFacts } from "@/lib/claims/businessFacts";

export interface InfluencerOutreachPlan {
  searchTerms: string[];
  outreachMessage: string;
  emailSubject: string;
  emailBody: string;
  collabIdeas: string[];
}

export async function generateInfluencerPlan(
  productOrService: string,
  city: string | null,
  brandProfile: any,
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  /** The business's own records. Was a pre-built prompt string, which is why this path had no guard. */
  facts?: BusinessFacts | null
): Promise<InfluencerOutreachPlan> {
  const fallback: InfluencerOutreachPlan = {
    searchTerms: [`${businessCategory} ${city ?? "India"}`, `${businessCategory} reels`],
    outreachMessage: `Hi! We loved your content and think you'd be a great fit to feature ${productOrService}. Would you be interested in a collaboration?`,
    emailSubject: `Collaboration opportunity — ${productOrService}`,
    emailBody: `Hi [Name],\n\nWe've been following your content and think you'd be a great fit to feature ${productOrService}. Would you be open to a collaboration? Happy to share more details.\n\nLooking forward to hearing from you.`,
    collabIdeas: ["Free product/service in exchange for an honest review", "Paid sponsored post"],
  };

  try {
    const copy = await generateCopy({
      topic: `influencer outreach for ${productOrService}`,
      businessName: facts?.businessName ?? "this business",
      businessCategory,
      facts,
      // The owner reads and edits these before sending any of them.
      mode: "draft",
      revise: true,
      language: brandProfile?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "influencer_plan",
      logContext,
      maxTokens: 700,
      brief: {
        label: "influencer outreach plan",
        instructions: `Find local micro-influencers to promote: "${productOrService}"${city ? ` in ${city}` : ""}.`,
        brandContext: `An Indian ${businessCategory} business wants to work with local micro-influencers.`,
        shapeHint: `Return JSON only:
{"searchTerms":["4-5 specific search phrases/hashtags to actually type into Instagram/YouTube search to find relevant local micro-influencers — be specific, not generic"],"outreachMessage":"a warm, specific DM template to send an influencer, in Hinglish, under 500 characters, with a placeholder like [Name] for personalization","emailSubject":"a short, specific email subject line for the same outreach, under 60 characters","emailBody":"a more formal outreach EMAIL version (not DM) — 4-6 sentences, English, with a [Name] placeholder, suitable for an influencer who prefers email contact — introduce the business, the collab idea, and a clear next step","collabIdeas":["3 concrete collaboration structure ideas appropriate for a small local business budget, e.g. barter/gifting vs paid, ranked cheapest first"]}`,
      },
    });
    if (copy._aiFailure) return withAiFailure(fallback, { kind: copy._aiFailure.kind } as any);
    if (copy._fallback) return fallback;
    const parsed = copy.output;
    return {
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms : fallback.searchTerms,
      outreachMessage: parsed.outreachMessage ?? fallback.outreachMessage,
      emailSubject: parsed.emailSubject ?? fallback.emailSubject,
      emailBody: parsed.emailBody ?? fallback.emailBody,
      collabIdeas: Array.isArray(parsed.collabIdeas) ? parsed.collabIdeas : fallback.collabIdeas,
    };
  } catch (err: any) {
    console.error("[influencer-agent] error:", err.message);
    return fallback;
  }
}
