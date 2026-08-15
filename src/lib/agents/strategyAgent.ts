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
  // AI-Intelligence Pillar 4 — null when there's no historical data or
  // target to ground an estimate in; never a fabricated number.
  estimated_leads: number | null;
}

import { logClaudeUsage } from "../usage/logUsage";

export async function generateMarketingStrategy(
  dealershipName: string,
  city: string | null,
  monthlyBudget: number,
  goal: string,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "car dealership",
  logContext?: { supabase: any; dealershipId: string },
  // Structured refinement on top of the free-text goal above — a
  // specific number the business owner wants ("100 leads"), not a
  // replacement for the qualitative goal dropdown.
  targetLeads?: number | null,
  // This dealer's own real average cost-per-lead, computed by the
  // caller from campaign_performance_history — only ever a genuine
  // historical figure, never estimated here.
  historicalCostPerLead?: number | null
): Promise<MarketingPlan> {
  const fallback: MarketingPlan & { _fallback?: boolean } = {
    _fallback: true,
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
    estimated_leads: historicalCostPerLead ? Math.round(monthlyBudget / historicalCostPerLead) : null,
  };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "not set"}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand profile set yet.";

  const goalContext = targetLeads
    ? `\nSpecific numeric goal: approximately ${targetLeads} leads this month with this budget — factor this directly into your budget_allocation and estimated_leads.`
    : "";

  const dataContext = historicalCostPerLead
    ? `\nThis dealer's actual historical average cost per lead (from their own real launched campaigns) is ₹${Math.round(historicalCostPerLead)}. Ground estimated_leads and your budget reasoning in this real number, not a generic industry guess.`
    : `\nThis dealer has no historical campaign performance data yet — base estimated_leads (if you give one) on general best-practice cost-per-lead ranges for Indian ${businessCategory} businesses, and say so plainly rather than presenting it as a confident number. Return null for estimated_leads if you can't honestly estimate it.`;

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
Goal: ${goal}${goalContext}
${brandContext}
${dataContext}

Only recommend channels this platform can actually execute today: Meta Ads (paid), organic Facebook posts, WhatsApp/email follow-up drafts, and a basic website/landing page. Do not recommend Google/LinkedIn/TikTok ads since those aren't connected yet.

Return JSON only:
{"overview":"2-3 sentence strategic summary","budget_allocation":[{"channel":"channel name","percent":number,"reason":"short reason"}],"funnel_focus":"1 sentence on where the funnel needs the most attention this month","monthly_themes":[{"week":"Week 1","focus":"theme for the week","action":"specific action to take"}],"recommended_offers":["2-3 offer ideas that fit the budget and goal"],"estimated_leads":"integer, your honest estimate of total leads this budget should generate this month, or null if you genuinely can't estimate it responsibly"}
budget_allocation percents must sum to 100. Give exactly 4 weekly themes.`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "marketing_strategy", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
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
      estimated_leads: typeof parsed.estimated_leads === "number" ? parsed.estimated_leads : fallback.estimated_leads,
    };
  } catch (err: any) {
    console.error("[strategy-agent] generateMarketingStrategy error:", err.message);
    return fallback;
  }
}
