// Competitor Intelligence Agent — Competitor Ads tracking already
// exists (Research page, Meta Ad Library). This covers Social Media
// Monitor, Pricing Compare, SEO Comparison, and Content Gap Analysis
// — all use Claude's web_search tool so results reflect what's
// actually publicly findable right now, not guessed from training
// data. New Product Alerts is a separate real monitoring system, see
// lib/automation/competitorMonitor.ts.

import { webSearchTool } from "@/lib/ai/searchCaps";
import { logPerplexityUsage } from "../usage/logUsage";
import { getModel } from "../models";
import type { PlanKey } from "../plans";
import { classifyResearch } from "../research/researchRouter";
import { callComplexResearch } from "../research/perplexityClient";
import { costOfClaudeCallInr, costOfPerplexityCallInr } from "../usage/pricing";
import { recordResearchCredits } from "../usage/researchCredits";
import { callClaude, withAiFailure, type AiFailureNote } from "@/lib/ai/claude";

import { COMPETITOR_TASKS, type CompetitorTaskMeta } from "@/lib/departments/competitor";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { COMPETITOR_TASKS };
export type { CompetitorTaskMeta };


export async function generateCompetitorIntel(
  taskKey: string,
  competitorName: string,
  dealershipName: string,
  businessCategory: string,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  // Defaults to "pro" — this feature is already gated to pro+ by
  // requireFeature(..., "competitorIntel") at the route level, so
  // Free never reaches here regardless.
  plan: PlanKey = "pro"
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote }> {
  const meta = COMPETITOR_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: `Couldn't complete ${meta.label.toLowerCase()} for ${competitorName} right now — try again shortly.` },
    _fallback: true,
  };

  // Research Router — all 4 tasks here are COMPLEX (multi-source
  // competitive research), so this is the most likely place Perplexity
  // actually engages once PERPLEXITY_API_KEY is set. Until then
  // routing.active is false and this behaves exactly as before.
  const routing = classifyResearch({ plan, taskType: taskKey });
  const prompt = `You are a competitive intelligence analyst working for "${dealershipName}", a ${businessCategory} business in India, researching their competitor "${competitorName}".${groundingContext ?? ""}

Task: ${meta.label}
${meta.instructions(competitorName, dealershipName, businessCategory)}

Return JSON only, no markdown, no preamble. Base your answer on what you actually find via search — never fabricate specific numbers, prices, or facts you didn't find. If information isn't publicly available, say so plainly in the relevant field.`;

  // Section 21 — automatic provider failover. Perplexity failing at
  // RUNTIME falls THROUGH to the Claude web_search path below rather
  // than returning an error, which is what this did before. The
  // customer never learns a provider failed; they get a real
  // researched answer from the substitute, not a degraded placeholder.
  if (routing.active && routing.provider === "perplexity") {
    // Unreachable today (routing.active requires PERPLEXITY_API_KEY).
    try {
      const result = await callComplexResearch(prompt);
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      const clean = (jsonMatch ? jsonMatch[0] : result.text).replace(/```json|```/g, "").trim();
      if (clean) {
        // Only bill once the call genuinely produced usable output —
        // a Perplexity response we then discard and redo on Claude
        // shouldn't cost the customer credits for both.
        if (logContext) {
          await logPerplexityUsage(logContext.supabase, logContext.dealershipId, "competitor_intel", result.inputTokens, result.outputTokens, "sonar-pro");
          await recordResearchCredits(logContext.dealershipId, costOfPerplexityCallInr(result.inputTokens, result.outputTokens, "sonar-pro"));
        }
        return { output: JSON.parse(clean) };
      }
      console.warn("[competitor-intel-agent] perplexity returned no usable JSON — falling back to Claude web search.");
    } catch (err: any) {
      console.warn("[competitor-intel-agent] perplexity failed, falling back to Claude web search:", err.message);
    }
  }

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
      tools: [webSearchTool("competitor_intel")],
    }, { operation: "competitor_intel", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const usage = r.data.usage;
    // Research Credits (Section 7) — real cost from this call.
    if (logContext && usage) await recordResearchCredits(logContext.dealershipId, costOfClaudeCallInr(usage.input_tokens ?? 0, usage.output_tokens ?? 0));
    // Web-search replies interleave text blocks with search results.
    const text = (r.data.content ?? [])
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[competitor-intel-agent] error:", err.message);
    return fallback;
  }
}
