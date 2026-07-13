// ------------------------------------------------------------------
// Marketing Strategy Agent — Phase 2
// ------------------------------------------------------------------
// Generates a monthly marketing roadmap: budget allocation across
// channels, funnel focus, campaign objectives, and a week-by-week
// content/campaign plan — using the dealership's Brand Profile and
// stated monthly budget/goal. Saved so it persists as "the current
// plan" rather than regenerating blindly every visit.
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  target_persona?: any;
  messaging_pillars?: string[] | null;
}

export interface MarketingPlan {
  overview: string;
  budget_allocation: { channel: string; percent: number; reason: string }[];
  funnel_focus: string;
  monthly_themes: { week: string; focus: string; action: string }[];
  recommended_offers: string[];
}

export async function generateMarketingStrategy(
  dealershipName: string,
  city: string | null,
  monthlyBudget: number,
  goal: string,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "car dealership"
): Promise<MarketingPlan> {
  const fallback: MarketingPlan = {
    overview: "Focus on consistent lead generation through Meta ads, supported by organic social content and follow-up on existing leads.",
    budget_allocation: [
      { channel: "Meta Ads", percent: 80, reason: "Primary lead-gen channel currently connected" },
      { channel: "Organic Social", percent: 20, reason: "Free, builds trust alongside paid reach" },
    ],
    funnel_focus: "Awareness through Meta ads, conversion through fast follow-up calls",
    monthly_themes: [
      { week: "Week 1", focus: "Highlight what you offer", action: "Launch a lead-gen ad + matching social post" },
      { week: "Week 2", focus: "Customer trust", action: "Share a testimonial or years-in-business story" },
      { week: "Week 3", focus: "Offer push", action: "Highlight a specific offer or promotion" },
      { week: "Week 4", focus: "Re-engagement", action: "Follow up with all leads still in Pipeline" },
    ],
    recommended_offers: ["A free consultation or demo", "A limited-time discount"],
  };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "not set"}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand profile set yet.";

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
        max_tokens: 1600,
        messages: [
          {
            role: "user",
            content: `You are a marketing strategist creating a monthly plan for an Indian ${businessCategory} business.
Business: ${dealershipName}${city ? `, ${city}` : ""}
Monthly budget: ₹${monthlyBudget}
Goal: ${goal}
${brandContext}

Only recommend channels this platform can actually execute today: Meta Ads (paid), organic Facebook posts, WhatsApp/email follow-up drafts, and a basic website/landing page. Do not recommend Google/LinkedIn/TikTok ads since those aren't connected yet.

Return JSON only:
{"overview":"2-3 sentence strategic summary","budget_allocation":[{"channel":"channel name","percent":number,"reason":"short reason"}],"funnel_focus":"1 sentence on where the funnel needs the most attention this month","monthly_themes":[{"week":"Week 1","focus":"theme for the week","action":"specific action to take"}],"recommended_offers":["2-3 offer ideas that fit the budget and goal"]}
budget_allocation percents must sum to 100. Give exactly 4 weekly themes.`,
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
      overview: parsed.overview ?? fallback.overview,
      budget_allocation: Array.isArray(parsed.budget_allocation) ? parsed.budget_allocation : fallback.budget_allocation,
      funnel_focus: parsed.funnel_focus ?? fallback.funnel_focus,
      monthly_themes: Array.isArray(parsed.monthly_themes) ? parsed.monthly_themes : fallback.monthly_themes,
      recommended_offers: Array.isArray(parsed.recommended_offers) ? parsed.recommended_offers : fallback.recommended_offers,
    };
  } catch (err: any) {
    console.error("[strategy-agent] generateMarketingStrategy error:", err.message);
    return fallback;
  }
}
