// AI Research Agent. Viral Content and Competitor Reports already
// exist elsewhere and aren't duplicated here (see Social Media
// Management and Competitor Intelligence). Industry Trends, Market
// Research, and New Opportunities use Claude's web_search tool for
// genuinely current information. Customer Sentiment is different on
// purpose — it doesn't search the web at all, it synthesizes the
// dealership's OWN real lead data (qualification_reason text +
// temperature/status already generated from real interactions),
// since that's the actual, honest signal available, not something to
// guess from search results about "customers in general."

export interface ResearchTaskMeta {
  key: string;
  label: string;
  usesWebSearch: boolean;
}

export const RESEARCH_TASKS: ResearchTaskMeta[] = [
  { key: "industry_trends", label: "Industry Trends", usesWebSearch: true },
  { key: "market_research", label: "Market Research", usesWebSearch: true },
  { key: "new_opportunities", label: "New Opportunities", usesWebSearch: true },
  { key: "customer_sentiment", label: "Customer Sentiment", usesWebSearch: false },
];

async function callClaude(body: any): Promise<any | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const bodyText = await response.text();
    if (!bodyText.trim()) return null;
    const data = JSON.parse(bodyText);
    const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return null;
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[research-agent] error:", err.message);
    return null;
  }
}

export async function generateResearch(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  city: string | null
): Promise<{ output: any; _fallback?: boolean }> {
  const location = city ? ` in ${city}, India` : " in India";
  const fallback = { output: { text: "Couldn't complete this research right now — try again shortly." }, _fallback: true };

  if (taskKey === "industry_trends") {
    const parsed = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: `Search for current trends affecting the ${businessCategory} industry${location}, relevant to a business called "${dealershipName}". Return JSON only: {"trends": [{"trend": "...", "impact": "how this affects a business like this"}]} — 5 trends, based on what you actually find.` }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });
    return parsed ? { output: parsed } : fallback;
  }

  if (taskKey === "market_research") {
    const parsed = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: `Search for market information relevant to a ${businessCategory} business${location}: market size/growth if publicly reported, typical customer demographics, and key demand drivers. Return JSON only: {"marketOverview": "...", "customerDemographics": "...", "demandDrivers": []} — say plainly if specific numbers aren't publicly available rather than inventing them.` }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });
    return parsed ? { output: parsed } : fallback;
  }

  if (taskKey === "new_opportunities") {
    const parsed = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: `Search for underserved needs, emerging niches, or growth opportunities in the ${businessCategory} space${location} that a business like "${dealershipName}" could pursue. Return JSON only: {"opportunities": [{"opportunity": "...", "why": "..."}]} — 4-5 opportunities grounded in what you find, not generic startup advice.` }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });
    return parsed ? { output: parsed } : fallback;
  }

  return fallback;
}

// Customer Sentiment — real internal data, no web search, no
// invented "customers are saying X" claims.
export async function generateSentimentFromLeads(
  dealershipName: string,
  businessCategory: string,
  leadSignals: { qualificationReason: string | null; temperature: string; status: string }[]
): Promise<{ output: any; _fallback?: boolean }> {
  const fallback = { output: { text: "Not enough lead data yet to analyze sentiment — this improves as more leads come in with qualification notes." }, _fallback: true };
  const withReasons = leadSignals.filter((l) => l.qualificationReason);
  if (withReasons.length < 3) return fallback;

  const summaryInput = withReasons.slice(0, 100).map((l) => `[${l.temperature}/${l.status}] ${l.qualificationReason}`).join("\n");

  const parsed = await callClaude({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are analyzing REAL qualification notes from ${dealershipName}'s own leads (a ${businessCategory} business) — these are notes written about actual conversations with real prospects, not hypothetical. Each line is [temperature/status] followed by the note.

${summaryInput}

Identify recurring themes — common interests, hesitations, price sensitivity, what makes leads "hot" vs "cold". Return JSON only: {"positiveThemes": [], "concernsOrObjections": [], "summary": "2-3 sentence overall read"}. Base this ONLY on what's actually in the notes above — don't invent sentiment that isn't reflected in the data.`,
    }],
  });
  return parsed ? { output: parsed } : fallback;
}
