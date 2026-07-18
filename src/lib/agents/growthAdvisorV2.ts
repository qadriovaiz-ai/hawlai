// AI Growth Advisor. Business Health Score and Next Best Actions
// already exist (growthAdvisorAgent.ts). This covers the rest —
// Growth Opportunities, Revenue Forecasting, Marketing Budget
// Recommendations, Expansion Strategy — reasoning over this
// business's OWN real data (leads, campaign spend/revenue, deal
// values), not web search and not invented numbers. Revenue
// Forecasting in particular does the actual math in code (not asked
// of the AI) so the numbers are real arithmetic on real historical
// data, with the AI only adding a narrative interpretation on top.

interface RevenueForecast {
  weeklyLeadCounts: number[]; // last 8 weeks, oldest first
  conversionRate: number | null;
  avgDealValue: number | null;
  forecast30Days: { low: number; mid: number; high: number } | null;
  narrative: string;
}

export async function computeRevenueForecast(supabase: any, dealershipId: string, dealershipName: string, businessCategory: string): Promise<RevenueForecast> {
  const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString();
  const { data: leads } = await supabase
    .from("leads")
    .select("created_at, status, deal_value")
    .eq("dealership_id", dealershipId)
    .gte("created_at", eightWeeksAgo);

  const all = leads ?? [];
  const weeklyLeadCounts: number[] = new Array(8).fill(0);
  const now = Date.now();
  for (const l of all) {
    const ageMs = now - new Date(l.created_at).getTime();
    const weekIndex = 7 - Math.min(7, Math.floor(ageMs / (7 * 24 * 60 * 60 * 1000)));
    if (weekIndex >= 0 && weekIndex < 8) weeklyLeadCounts[weekIndex]++;
  }

  const converted = all.filter((l: any) => l.status === "converted");
  const conversionRate = all.length > 0 ? converted.length / all.length : null;
  const dealValues = converted.map((l: any) => Number(l.deal_value) || 0).filter((v: number) => v > 0);
  const avgDealValue = dealValues.length > 0 ? dealValues.reduce((a: number, b: number) => a + b, 0) / dealValues.length : null;

  let forecast30Days: RevenueForecast["forecast30Days"] = null;
  if (conversionRate !== null && avgDealValue !== null && weeklyLeadCounts.some((c) => c > 0)) {
    const avgWeekly = weeklyLeadCounts.reduce((a, b) => a + b, 0) / 8;
    const minWeekly = Math.min(...weeklyLeadCounts);
    const maxWeekly = Math.max(...weeklyLeadCounts);
    const weeksIn30Days = 30 / 7;
    forecast30Days = {
      low: Math.round(minWeekly * weeksIn30Days * conversionRate * avgDealValue),
      mid: Math.round(avgWeekly * weeksIn30Days * conversionRate * avgDealValue),
      high: Math.round(maxWeekly * weeksIn30Days * conversionRate * avgDealValue),
    };
  }

  let narrative = "Not enough historical data yet to forecast confidently — this improves as more leads and conversions come in.";
  if (forecast30Days) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          messages: [{
            role: "user",
            content: `${dealershipName}, a ${businessCategory} business, has this REAL data: weekly lead counts over the last 8 weeks: [${weeklyLeadCounts.join(", ")}]. Conversion rate: ${(conversionRate! * 100).toFixed(1)}%. Average deal value: ₹${avgDealValue}. Computed 30-day revenue forecast range: ₹${forecast30Days.low} to ₹${forecast30Days.high} (mid ₹${forecast30Days.mid}).\n\nWrite a 2-3 sentence plain-English interpretation of this trend and forecast — is lead volume growing/shrinking/flat, what does that mean for the forecast, any caveat worth noting. Return JSON only: {"narrative": "..."}`,
          }],
        }),
      });
      if (response.ok) {
        const bodyText = await response.text();
        const data = JSON.parse(bodyText);
        const text = data.content?.[0]?.text ?? "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
        if (clean) narrative = JSON.parse(clean).narrative ?? narrative;
      }
    } catch (err: any) {
      console.error("[growth-advisor-v2] forecast narrative error:", err.message);
    }
  }

  return { weeklyLeadCounts, conversionRate, avgDealValue, forecast30Days, narrative };
}

async function callClaude(prompt: string, maxTokens = 1500): Promise<any | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) return null;
    const bodyText = await response.text();
    if (!bodyText.trim()) return null;
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return null;
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[growth-advisor-v2] error:", err.message);
    return null;
  }
}

export async function generateGrowthOpportunities(dealershipName: string, businessCategory: string, dataContext: string) {
  const fallback = { output: { text: "Not enough data yet to identify specific opportunities." }, _fallback: true };
  const parsed = await callClaude(`You are a growth advisor for "${dealershipName}", a ${businessCategory} business in India. Here's their real current data:\n${dataContext}\n\nBased ONLY on this real data (not general market advice), identify 3-5 specific growth opportunities — gaps in their own funnel, underused channels, patterns in what's converting vs not. Return JSON only: {"opportunities": [{"opportunity": "...", "why": "grounded in the data above"}]}`);
  return parsed ? { output: parsed } : fallback;
}

export async function generateBudgetRecommendations(dealershipName: string, businessCategory: string, campaignContext: string) {
  const fallback = { output: { text: "No campaign spend data yet to base budget recommendations on." }, _fallback: true };
  const parsed = await callClaude(`You are a media buyer advising "${dealershipName}", a ${businessCategory} business. Here's their REAL campaign performance data:\n${campaignContext}\n\nRecommend how to reallocate their marketing budget based on what's actually performing — which campaigns to scale, which to cut or fix, and why, using the real spend/leads/revenue numbers above. Return JSON only: {"recommendations": [{"campaign": "...", "action": "scale up | maintain | pause | fix", "reasoning": "..."}], "overallGuidance": "1-2 sentences"}`);
  return parsed ? { output: parsed } : fallback;
}

export async function generateExpansionStrategy(dealershipName: string, businessCategory: string, city: string | null, healthScore: number, dataContext: string) {
  const fallback = { output: { text: "Focus on stabilizing current operations before considering expansion." }, _fallback: true };
  const parsed = await callClaude(`You are a growth strategist advising "${dealershipName}", a ${businessCategory} business${city ? ` in ${city}` : ""} with a current health score of ${healthScore}/100. Real current data:\n${dataContext}\n\nGiven this business's actual current state (not hypothetical), give honest advice on expansion readiness — should they expand now (new location/service line/hours) or focus on strengthening the core first, and what would need to be true before expanding. Return JSON only: {"readiness": "not yet | cautiously | ready", "reasoning": "...", "considerations": ["3-4 concrete things to evaluate before expanding"]}`);
  return parsed ? { output: parsed } : fallback;
}
