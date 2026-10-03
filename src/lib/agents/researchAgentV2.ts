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

import { webSearchTool } from "@/lib/ai/searchCaps";
import { getModel } from "../models";
import type { PlanKey } from "../plans";
import { classifyResearch } from "../research/researchRouter";
import { callComplexResearch, callDeepResearch } from "../research/perplexityClient";

import { RESEARCH_TASKS, type ResearchTaskMeta } from "@/lib/departments/research";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { RESEARCH_TASKS };
export type { ResearchTaskMeta };


import { logPerplexityUsage } from "../usage/logUsage";
import { callClaude, withAiFailure, type AiFailure, type AiFailureNote } from "@/lib/ai/claude";
import { costOfClaudeCallInr, costOfPerplexityCallInr } from "../usage/pricing";
import { recordResearchCredits } from "../usage/researchCredits";
import { factsPrompt, type BusinessFacts } from "@/lib/claims/businessFacts";
import { answeredByNote, type AnsweredBy } from "../research/provenance";
import { guardDepartmentOutput } from "@/lib/claims/guardDepartment";
import { parseModelJson } from "@/lib/ai/modelJson";

/** The parsed JSON, or null — with the reason when the AI itself failed. */
type Researched = { parsed: any | null; failure?: AiFailure };

async function askClaude(body: any, logContext?: { supabase: any; dealershipId: string }): Promise<Researched> {
  try {
    const r = await callClaude(body, { operation: "research", logContext });
    if (!r.ok) return { parsed: null, failure: r.failure };
    const usage = r.data.usage;
    if (logContext && usage) {
      // Research Credits (Section 7) — real cost from what this call
      // actually used, converted through the one tunable credit rate.
      await recordResearchCredits(logContext.dealershipId, costOfClaudeCallInr(usage.input_tokens ?? 0, usage.output_tokens ?? 0, body.model));
    }
    // Web-search replies interleave text blocks with search results.
    const text = (r.data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[researchAgentV2] ${parsedReply.cause}: ${parsedReply.detail}`);
      return { parsed: null };
    }
    return { parsed: parsedReply.value };
  } catch (err: any) {
    console.error("[research-agent] error:", err.message);
    return { parsed: null };
  }
}

/**
 * The parsed answer, checked against what the business can back up.
 *
 * MEASURED BEFORE WIRING (2026-10-03), because a research answer is
 * mostly about the market rather than about this business and a guard
 * that ate its findings would be worse than none: market growth figures,
 * cited reports and named opportunities all pass through untouched. What
 * it catches is the sentence that turns outward research into an
 * unbacked boast about the reader — "you are the most trusted candle
 * brand in Shahjahanpur, with hundreds of happy customers" — which is
 * exactly the line an owner would copy into an ad.
 */
function researchResult(
  r: Researched,
  fallback: { output: any; _fallback: boolean },
  facts?: BusinessFacts | null,
  answeredBy?: AnsweredBy
) {
  if (!r.parsed) return r.failure ? withAiFailure(fallback, r.failure) : fallback;
  const guarded = guardDepartmentOutput(r.parsed, facts, "draft").output;
  // Only on a real answer: a fallback placeholder has no provider to name.
  return { output: answeredBy ? { ...guarded, _provider: answeredByNote(answeredBy) } : guarded };
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
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(result.text);
    if (!parsedReply.ok) {
      console.error(`[researchAgentV2] ${parsedReply.cause}: ${parsedReply.detail}`);
      return null;
    }
    const parsed = parsedReply.value;

    // Billed only AFTER the output is confirmed usable. Returning null
    // here makes the caller fall back to Claude (Section 21), which
    // bills its own cost — charging for the discarded Perplexity call
    // too would make the customer pay twice for one result.
    if (logContext) {
      const model = result.model as "sonar-pro" | "sonar-deep-research";
      await logPerplexityUsage(logContext.supabase, logContext.dealershipId, "research", result.inputTokens, result.outputTokens, model);
      await recordResearchCredits(logContext.dealershipId, costOfPerplexityCallInr(result.inputTokens, result.outputTokens, model));
    }
    return parsed;
  } catch (err: any) {
    console.warn("[research-agent] perplexity failed, falling back to Claude web search:", err.message);
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
  plan: PlanKey = "pro",
  facts?: BusinessFacts | null
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote }> {
  const location = city ? ` in ${city}, India` : " in India";
  const fallback = { output: { text: "Couldn't complete this research right now — try again shortly." }, _fallback: true };
  const grounding = `${groundingContext ?? ""}${factsPrompt(facts)}`;

  // Research Router — decides depth + provider for this task/plan.
  // Provider only ever resolves to Perplexity when routing.active is
  // true (PERPLEXITY_API_KEY set); until then every task below keeps
  // using Claude's own web_search exactly as before this wiring.
  const routing = classifyResearch({ plan, taskType: taskKey });
  const usePerplexity = routing.active && (routing.provider === "perplexity" || routing.provider === "perplexity_deep");

  // Section 21 — automatic provider failover. Perplexity failing at
  // RUNTIME (outage, rate limit, malformed response) now falls through
  // to Claude's own web search rather than surfacing an error, which
  // is what the previous version did. researchRouter's own check is
  // config-time only ("is the key set?") and can't catch this.
  //
  // The failover itself is not surfaced as an error, per Section 21 — the
  // answer really was researched, by a real substitute, so an error would
  // be wrong. WHICH provider answered is a different question, and until
  // 2026-10-03 the only record of it was a console.warn nobody reads.
  // Now it travels back with the result (src/lib/research/provenance.ts),
  // so nothing is presented as deeper than it was.
  let answeredBy: AnsweredBy = { provider: "claude_web_search", searchCap: "deep_research" };
  if (!routing.active && (routing.researchMode === "complex" || routing.researchMode === "deep")) {
    // The router already knew this and said it only to itself.
    answeredBy = { ...answeredBy, intended: routing.researchMode === "deep" ? "perplexity_deep" : "perplexity", fellBackBecause: "not_connected" };
  }

  const runResearch = async (prompt: string): Promise<Researched> => {
    const claudeCall = () => askClaude(
      { model: getModel("standard"), max_tokens: 2000, messages: [{ role: "user", content: prompt }], tools: [webSearchTool("deep_research")] },
      logContext
    );
    if (!usePerplexity) return claudeCall();

    const viaPerplexity = await callPerplexityAsJson(
      routing.provider === "perplexity_deep" ? callDeepResearch : callComplexResearch,
      prompt,
      logContext
    );
    if (viaPerplexity) {
      answeredBy = { provider: routing.provider as AnsweredBy["provider"] };
      return { parsed: viaPerplexity };
    }

    console.warn(`[research-agent] ${routing.provider} failed for "${taskKey}" — falling back to Claude web search.`);
    answeredBy = { provider: "claude_web_search", searchCap: "deep_research", intended: routing.provider, fellBackBecause: "failed" };
    return claudeCall();
  };

  if (taskKey === "industry_trends") {
    const researched = await runResearch(`Search for current trends affecting the ${businessCategory} industry${location}, relevant to a business called "${dealershipName}". Return JSON only: {"trends": [{"trend": "...", "impact": "how this affects a business like this"}]} — 5 trends, based on what you actually find.${grounding}`);
    return researchResult(researched, fallback, facts, answeredBy);
  }

  if (taskKey === "market_research") {
    const researched = await runResearch(`Search for market information relevant to a ${businessCategory} business${location}: market size/growth if publicly reported, typical customer demographics, and key demand drivers. Return JSON only: {"marketOverview": "...", "customerDemographics": "...", "demandDrivers": []} — say plainly if specific numbers aren't publicly available rather than inventing them.${grounding}`);
    return researchResult(researched, fallback, facts, answeredBy);
  }

  if (taskKey === "new_opportunities") {
    const researched = await runResearch(`Search for underserved needs, emerging niches, or growth opportunities in the ${businessCategory} space${location} that a business like "${dealershipName}" could pursue. Return JSON only: {"opportunities": [{"opportunity": "...", "why": "..."}]} — 4-5 opportunities grounded in what you find, not generic startup advice.${grounding}`);
    return researchResult(researched, fallback, facts, answeredBy);
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
  groundingContext?: string,
  facts?: BusinessFacts | null
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote }> {
  const fallback = { output: { text: "Not enough lead data yet to analyze sentiment — this improves as more leads come in with qualification notes." }, _fallback: true };
  const withReasons = leadSignals.filter((l) => l.qualificationReason);
  if (withReasons.length < 3) return fallback;

  const summaryInput = withReasons.slice(0, 100).map((l) => `[${l.temperature}/${l.status}] ${l.qualificationReason}`).join("\n");

  const researched = await askClaude({
    model: getModel("standard"),
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are analyzing REAL qualification notes from ${dealershipName}'s own leads (a ${businessCategory} business) — these are notes written about actual conversations with real prospects, not hypothetical. Each line is [temperature/status] followed by the note.

${summaryInput}

Identify recurring themes — common interests, hesitations, price sensitivity, what makes leads "hot" vs "cold". Return JSON only: {"positiveThemes": [], "concernsOrObjections": [], "summary": "2-3 sentence overall read"}. Base this ONLY on what's actually in the notes above — don't invent sentiment that isn't reflected in the data.${groundingContext ?? ""}`,
    }],
  }, logContext);
  // Customer Sentiment searches nothing — it reads this business's own
  // lead notes, which is the honest signal available and a stronger one
  // than anything the web could say about "customers in general". Worth
  // saying, so nobody reads it as outward research either.
  const { output, ...rest } = researchResult(researched, fallback, facts) as any;
  if (rest._fallback || rest._aiFailure) return { output, ...rest };
  return { output: { ...output, _provider: `Read from ${withReasons.length} of your own leads' qualification notes — no web search, so nothing here comes from outside your own records.` }, ...rest };
}
