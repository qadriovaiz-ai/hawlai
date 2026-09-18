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

import { getCampaignPerformanceState, CampaignPerformance } from "./analyticsAgent";
import { getModel } from "../models";
import { callClaude, aiFailureNote, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";

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
  /** Set when the AI couldn't review the campaigns; `summary` then says why. */
  _aiFailure?: AiFailureNote;
}

async function getRecommendations(campaigns: CampaignPerformance[], businessCategory: string, logContext?: { supabase: any; dealershipId: string }): Promise<{ recommendations: OptimizationRecommendation[]; summary: string; _aiFailure?: AiFailureNote }> {
  const fallback = {
    recommendations: [],
    summary: "Not enough spend/lead data yet to make confident recommendations.",
  };

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `You are a paid-ads optimization specialist reviewing campaigns for an Indian ${businessCategory} business.
Campaign data: ${JSON.stringify(campaigns, null, 2)}

For each campaign with meaningful spend or leads, recommend one action. Return JSON only:
{"summary":"1-2 sentence overview of what's working and what isn't","recommendations":[{"campaign_id":"id from the data","headline":"headline from the data","action":"scale"|"pause"|"watch"|"fix_targeting","reason":"short, specific reason based on the actual numbers"}]}
Only include campaigns where you have enough signal (spend > 0 or leads > 0) to say something meaningful. If none qualify, return empty recommendations array.`,
        },
      ],
    }, { operation: "optimization_recommendations", logContext });
    // "Not enough data" would be untrue here — the data was there, the AI wasn't.
    if (!r.ok) return { recommendations: [], summary: aiFailureMessage(r.failure.kind), _aiFailure: aiFailureNote(r.failure) };
    const text = r.text;
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
  const [performanceState, { data: dealership }] = await Promise.all([
    getCampaignPerformanceState(supabase, dealershipId),
    supabase.from("dealerships").select("business_category").eq("id", dealershipId).single(),
  ]);
  const businessCategory = dealership?.business_category ?? "business";

  // Previously this said "No launched campaigns yet — nothing to
  // optimize until you launch one" whenever the result was empty,
  // including when the Meta token was missing. A dealer with live
  // campaigns and an expired connection was told they had none.
  if (performanceState.state !== "ok") {
    return {
      hasEnoughData: false,
      recommendations: [],
      summary:
        performanceState.state === "not_connected"
          ? "Your Meta ad account isn't connected, so campaign performance can't be read. Reconnect it in Settings → Integrations to get recommendations."
          : performanceState.state === "error"
          ? "Couldn't load your campaigns just now, so there are no recommendations to give. Try again shortly."
          : performanceState.reason,
    };
  }

  const performance = performanceState.value;
  const hasEnoughData = performance.campaigns.some((c) => c.spend > 0 || c.leads > 0);

  if (!hasEnoughData) {
    return {
      hasEnoughData: false,
      recommendations: [],
      // Reached only with campaigns present and readable, so this is
      // now unambiguously "live but no numbers yet".
      summary: "Campaigns are live but don't have spend or lead data yet — check back once they've been running a bit.",
    };
  }

  const { recommendations, summary, _aiFailure } = await getRecommendations(performance.campaigns, businessCategory, { supabase, dealershipId });
  return { hasEnoughData: true, recommendations, summary, ...(_aiFailure ? { _aiFailure } : {}) };
}
