// ------------------------------------------------------------------
// Optimization Agent — Phase 2 basic version
// ------------------------------------------------------------------
// Reuses Analytics Agent's campaign performance data and asks Claude
// to recommend concrete actions (pause underperformers, increase
// budget on winners, fix targeting). Until real campaigns have spend
// and leads (blocked on the Meta payment method issue), this will
// correctly report "not enough data yet" — that's expected, not a
// bug, and it'll start giving real recommendations the moment
// campaigns are live.
// ------------------------------------------------------------------

import { getCampaignPerformance, CampaignPerformance } from "./analyticsAgent";

export interface OptimizationRecommendation {
  campaign_id: string;
  headline: string;
  action: "scale" | "pause" | "watch" | "fix_targeting";
  reason: string;
}

export interface OptimizationResult {
  hasEnoughData: boolean;
  recommendations: OptimizationRecommendation[];
  summary: string;
}

async function getRecommendations(campaigns: CampaignPerformance[]): Promise<{ recommendations: OptimizationRecommendation[]; summary: string }> {
  const fallback = {
    recommendations: [],
    summary: "Not enough spend/lead data yet to make confident recommendations.",
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
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `You are a paid-ads optimization specialist reviewing campaigns for an Indian car dealership.
Campaign data: ${JSON.stringify(campaigns, null, 2)}

For each campaign with meaningful spend or leads, recommend one action. Return JSON only:
{"summary":"1-2 sentence overview of what's working and what isn't","recommendations":[{"campaign_id":"id from the data","headline":"headline from the data","action":"scale"|"pause"|"watch"|"fix_targeting","reason":"short, specific reason based on the actual numbers"}]}
Only include campaigns where you have enough signal (spend > 0 or leads > 0) to say something meaningful. If none qualify, return empty recommendations array.`,
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
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      summary: parsed.summary ?? fallback.summary,
    };
  } catch (err: any) {
    console.error("[optimization-agent] getRecommendations error:", err.message);
    return fallback;
  }
}

export async function analyzeCampaigns(supabase: any, dealershipId: string): Promise<OptimizationResult> {
  const performance = await getCampaignPerformance(supabase, dealershipId);
  const hasEnoughData = performance.campaigns.some((c) => c.spend > 0 || c.leads > 0);

  if (!hasEnoughData) {
    return {
      hasEnoughData: false,
      recommendations: [],
      summary:
        performance.campaigns.length === 0
          ? "No launched campaigns yet — nothing to optimize until you launch one."
          : "Campaigns are live but don't have spend or lead data yet — check back once they've been running a bit.",
    };
  }

  const { recommendations, summary } = await getRecommendations(performance.campaigns);
  return { hasEnoughData: true, recommendations, summary };
}
