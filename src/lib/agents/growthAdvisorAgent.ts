// ------------------------------------------------------------------
// CEO Growth Advisor Agent
// ------------------------------------------------------------------
// Synthesizes what every other agent already knows (leads, campaign
// performance, revenue, optimization recommendations) into one
// high-level "how is my business doing and what should I do next"
// view — the genuinely new thing here is the synthesis, not new data
// collection, since all the underlying numbers already exist.
// ------------------------------------------------------------------

import { getCampaignPerformance } from "./analyticsAgent";

export interface GrowthReport {
  healthScore: number; // 0-100
  headline: string;
  strengths: string[];
  risks: string[];
  nextActions: string[];
}

export async function generateGrowthReport(supabase: any, dealershipId: string, businessCategory: string = "car dealership"): Promise<GrowthReport> {
  const [{ data: leads }, performance, { data: dealership }] = await Promise.all([
    supabase.from("leads").select("lead_temperature, status, created_at, deal_value").eq("dealership_id", dealershipId),
    getCampaignPerformance(supabase, dealershipId),
    supabase.from("dealerships").select("dealership_name, onboarding_completed").eq("id", dealershipId).single(),
  ]);

  const totalLeads = leads?.length ?? 0;
  const hotLeads = leads?.filter((l: any) => l.lead_temperature === "hot").length ?? 0;
  const converted = leads?.filter((l: any) => l.status === "converted").length ?? 0;
  const totalRevenue = performance.campaigns.reduce((s, c) => s + c.revenue, 0);
  const totalSpend = performance.totals.spend;
  const liveCampaigns = performance.campaigns.filter((c) => c.meta_status === "ACTIVE").length;

  const fallback: GrowthReport = {
    healthScore: totalLeads === 0 ? 10 : liveCampaigns === 0 ? 30 : 60,
    headline: totalLeads === 0 ? "Just getting started — no leads yet." : "Building momentum.",
    strengths: [],
    risks: totalLeads === 0 ? ["No leads yet — launch your first campaign"] : [],
    nextActions: totalLeads === 0 ? ["Launch your first ad in Marketing → Launch Ad"] : ["Check Optimization for campaign recommendations"],
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
            content: `You are a blunt, experienced growth advisor reviewing this Indian ${businessCategory} business's marketing health. Real data — don't invent numbers:
Total leads: ${totalLeads} (${hotLeads} currently Hot)
Converted to sales: ${converted}
Live campaigns right now: ${liveCampaigns}
Total ad spend so far: ₹${totalSpend}
Total revenue attributed to ads: ₹${totalRevenue}
Onboarding complete: ${dealership?.onboarding_completed ? "yes" : "no"}

Return JSON only:
{"healthScore":integer 0-100 (be honest — a business with 0 leads or 0 live campaigns should score low, not a participation-trophy number),"headline":"one blunt sentence summarizing where they stand","strengths":["1-2 honest positives, or empty array if none yet"],"risks":["1-3 real risks/gaps, most urgent first"],"nextActions":["1-3 concrete next actions, most impactful first, specific enough to act on today"]}`,
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
      healthScore: typeof parsed.healthScore === "number" ? parsed.healthScore : fallback.healthScore,
      headline: parsed.headline ?? fallback.headline,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : fallback.nextActions,
    };
  } catch (err: any) {
    console.error("[growth-advisor-agent] error:", err.message);
    return fallback;
  }
}
