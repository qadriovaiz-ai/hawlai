// ------------------------------------------------------------------
// Influencer Outreach Agent
// ------------------------------------------------------------------
// Honest scope: there's no real influencer-discovery data source
// wired in here (that would need a paid influencer database API,
// which nobody's connected) — this drafts outreach messages and
// gives concrete search terms to use directly on Instagram/YouTube,
// rather than pretending to auto-find real influencer accounts.
// ------------------------------------------------------------------

import { getModel } from "../models";
import { callClaude, withAiFailure } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";

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
  groundingContext?: string
): Promise<InfluencerOutreachPlan> {
  const fallback: InfluencerOutreachPlan = {
    searchTerms: [`${businessCategory} ${city ?? "India"}`, `${businessCategory} reels`],
    outreachMessage: `Hi! We loved your content and think you'd be a great fit to feature ${productOrService}. Would you be interested in a collaboration?`,
    emailSubject: `Collaboration opportunity — ${productOrService}`,
    emailBody: `Hi [Name],\n\nWe've been following your content and think you'd be a great fit to feature ${productOrService}. Would you be open to a collaboration? Happy to share more details.\n\nLooking forward to hearing from you.`,
    collabIdeas: ["Free product/service in exchange for an honest review", "Paid sponsored post"],
  };

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: `An Indian ${businessCategory} business wants to find local micro-influencers to promote: "${productOrService}"${city ? ` in ${city}` : ""}.${groundingContext ?? ""}

Return JSON only:
{"searchTerms":["4-5 specific search phrases/hashtags to actually type into Instagram/YouTube search to find relevant local micro-influencers — be specific, not generic"],"outreachMessage":"a warm, specific DM template to send an influencer, in Hinglish, under 500 characters, with a placeholder like [Name] for personalization","emailSubject":"a short, specific email subject line for the same outreach, under 60 characters","emailBody":"a more formal outreach EMAIL version (not DM) — 4-6 sentences, English, with a [Name] placeholder, suitable for an influencer who prefers email contact — introduce the business, the collab idea, and a clear next step","collabIdeas":["3 concrete collaboration structure ideas appropriate for a small local business budget, e.g. barter/gifting vs paid, ranked cheapest first"]}`,
        },
      ],
    }, { operation: "influencer_plan", logContext });
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
      console.error(`[influencerAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return fallback;
    }
    const parsed = parsedReply.value;
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
