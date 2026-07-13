// ------------------------------------------------------------------
// Influencer Outreach Agent
// ------------------------------------------------------------------
// Honest scope: there's no real influencer-discovery data source
// wired in here (that would need a paid influencer database API,
// which nobody's connected) — this drafts outreach messages and
// gives concrete search terms to use directly on Instagram/YouTube,
// rather than pretending to auto-find real influencer accounts.
// ------------------------------------------------------------------

export interface InfluencerOutreachPlan {
  searchTerms: string[];
  outreachMessage: string;
  collabIdeas: string[];
}

export async function generateInfluencerPlan(
  productOrService: string,
  city: string | null,
  brandProfile: any,
  businessCategory: string = "car dealership"
): Promise<InfluencerOutreachPlan> {
  const fallback: InfluencerOutreachPlan = {
    searchTerms: [`${businessCategory} ${city ?? "India"}`, `${businessCategory} reels`],
    outreachMessage: `Hi! We loved your content and think you'd be a great fit to feature ${productOrService}. Would you be interested in a collaboration?`,
    collabIdeas: ["Free product/service in exchange for an honest review", "Paid sponsored post"],
  };

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
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `An Indian ${businessCategory} business wants to find local micro-influencers to promote: "${productOrService}"${city ? ` in ${city}` : ""}.

Return JSON only:
{"searchTerms":["4-5 specific search phrases/hashtags to actually type into Instagram/YouTube search to find relevant local micro-influencers — be specific, not generic"],"outreachMessage":"a warm, specific DM template to send an influencer, in Hinglish, under 500 characters, with a placeholder like [Name] for personalization","collabIdeas":["3 concrete collaboration structure ideas appropriate for a small local business budget, e.g. barter/gifting vs paid, ranked cheapest first"]}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    return {
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms : fallback.searchTerms,
      outreachMessage: parsed.outreachMessage ?? fallback.outreachMessage,
      collabIdeas: Array.isArray(parsed.collabIdeas) ? parsed.collabIdeas : fallback.collabIdeas,
    };
  } catch (err: any) {
    console.error("[influencer-agent] error:", err.message);
    return fallback;
  }
}
