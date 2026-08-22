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

import { getModel } from "../models";
import type { PlanKey } from "../plans";
import { classifyResearch } from "../research/researchRouter";
import { callComplexResearch, callDeepResearch } from "../research/perplexityClient";

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

import { logClaudeUsage, logPerplexityUsage } from "../usage/logUsage";
import { costOfClaudeCallInr, costOfPerplexityCallInr } from "../usage/pricing";
import { recordResearchCredits } from "../usage/researchCredits";

async function callClaude(body: any, logContext?: { supabase: any; dealershipId: string }): Promise<any | null> {
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
    if (logContext && data.usage) {
      const inputTokens = data.usage.input_tokens ?? 0;
      const outputTokens = data.usage.output_tokens ?? 0;
      await logClaudeUsage(logContext.supabase, logContext.dealershipId, "research", inputTokens, outputTokens, body.model);
      // Research Credits (Section 7) — real cost from what this call
      // actually used, converted through the one tunable credit rate.
      await recordResearchCredits(logContext.dealershipId, costOfClaudeCallInr(inputTokens, outputTokens, body.model));
    }
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

// Perplexity path — only ever reached when researchRouter.ts's
// classifyResearch() returns active:true (PERPLEXITY_API_KEY set), so
// this is unreachable in production today.
async function callPerplexityAsJson(
  fn: (prompt: string, maxTokens?: number) => Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }>,
  prompt: string,
  logContext?: { supabase: any; dealershipId: string }
): Promise<any | null> {
  try {
    const result = await fn(`${prompt}\n\nReturn JSON only, no markdown, no preamble.`);
    if (logContext) {
      const model = result.model as "sonar-pro" | "sonar-deep-research";
      await logPerplexityUsage(logContext.supabase, logContext.dealershipId, "research", result.inputTokens, result.outputTokens, model);
      await recordResearchCredits(logContext.dealershipId, costOfPerplexityCallInr(result.inputTokens, result.outputTokens, model));
    }
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : result.text).replace(/```json|```/g, "").trim();
    if (!clean) return null;
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[research-agent] perplexity error:", err.message);
    return null;
  }
}

export async function generateResearch(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  city: string | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  // Defaults to "pro" (unrestricted) rather than "free" — a caller
  // that hasn't been updated to pass the real plan gets today's exact
  // behavior, not an accidental Free-tier downgrade.
  plan: PlanKey = "pro"
): Promise<{ output: any; _fallback?: boolean }> {
  const location = city ? ` in ${city}, India` : " in India";
  const fallback = { output: { text: "Couldn't complete this research right now — try again shortly." }, _fallback: true };
  const grounding = groundingContext ?? "";

  // Research Router — decides depth + provider for this task/plan.
  // Provider only ever resolves to Perplexity when routing.active is
  // true (PERPLEXITY_API_KEY set); until then every task below keeps
  // using Claude's own web_search exactly as before this wiring.
  const routing = classifyResearch({ plan, taskType: taskKey });
  const usePerplexity = routing.active && (routing.provider === "perplexity" || routing.provider === "perplexity_deep");

  if (taskKey === "industry_trends") {
    const prompt = `Search for current trends affecting the ${businessCategory} industry${location}, relevant to a business called "${dealershipName}". Return JSON only: {"trends": [{"trend": "...", "impact": "how this affects a business like this"}]} — 5 trends, based on what you actually find.${grounding}`;
    const parsed = usePerplexity
      ? await callPerplexityAsJson(routing.provider === "perplexity_deep" ? callDeepResearch : callComplexResearch, prompt, logContext)
      : await callClaude({ model: getModel("standard"), max_tokens: 2000, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search" }] }, logContext);
    return parsed ? { output: parsed } : fallback;
  }

  if (taskKey === "market_research") {
    const prompt = `Search for market information relevant to a ${businessCategory} business${location}: market size/growth if publicly reported, typical customer demographics, and key demand drivers. Return JSON only: {"marketOverview": "...", "customerDemographics": "...", "demandDrivers": []} — say plainly if specific numbers aren't publicly available rather than inventing them.${grounding}`;
    const parsed = usePerplexity
      ? await callPerplexityAsJson(routing.provider === "perplexity_deep" ? callDeepResearch : callComplexResearch, prompt, logContext)
      : await callClaude({ model: getModel("standard"), max_tokens: 2000, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search" }] }, logContext);
    return parsed ? { output: parsed } : fallback;
  }

  if (taskKey === "new_opportunities") {
    const prompt = `Search for underserved needs, emerging niches, or growth opportunities in the ${businessCategory} space${location} that a business like "${dealershipName}" could pursue. Return JSON only: {"opportunities": [{"opportunity": "...", "why": "..."}]} — 4-5 opportunities grounded in what you find, not generic startup advice.${grounding}`;
    const parsed = usePerplexity
      ? await callPerplexityAsJson(routing.provider === "perplexity_deep" ? callDeepResearch : callComplexResearch, prompt, logContext)
      : await callClaude({ model: getModel("standard"), max_tokens: 2000, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search" }] }, logContext);
    return parsed ? { output: parsed } : fallback;
  }

  return fallback;
}

// Customer Sentiment — real internal data, no web search, no
// invented "customers are saying X" claims.
export async function generateSentimentFromLeads(
  dealershipName: string,
  businessCategory: string,
  leadSignals: { qualificationReason: string | null; temperature: string; status: string }[],
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string
): Promise<{ output: any; _fallback?: boolean }> {
  const fallback = { output: { text: "Not enough lead data yet to analyze sentiment — this improves as more leads come in with qualification notes." }, _fallback: true };
  const withReasons = leadSignals.filter((l) => l.qualificationReason);
  if (withReasons.length < 3) return fallback;

  const summaryInput = withReasons.slice(0, 100).map((l) => `[${l.temperature}/${l.status}] ${l.qualificationReason}`).join("\n");

  const parsed = await callClaude({
    model: getModel("standard"),
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are analyzing REAL qualification notes from ${dealershipName}'s own leads (a ${businessCategory} business) — these are notes written about actual conversations with real prospects, not hypothetical. Each line is [temperature/status] followed by the note.

${summaryInput}

Identify recurring themes — common interests, hesitations, price sensitivity, what makes leads "hot" vs "cold". Return JSON only: {"positiveThemes": [], "concernsOrObjections": [], "summary": "2-3 sentence overall read"}. Base this ONLY on what's actually in the notes above — don't invent sentiment that isn't reflected in the data.${groundingContext ?? ""}`,
    }],
  }, logContext);
  return parsed ? { output: parsed } : fallback;
}
