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
import { factsPrompt, type BusinessFacts } from "@/lib/claims/businessFacts";
import { answeredByNote, type AnsweredBy } from "../research/provenance";
import { checkCitations, unverifiedNote, tierFromSources, NOTHING_CITED, NATIONAL_NOTE } from "@/lib/competitors/citationCheck";

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
  plan: PlanKey = "pro",
  // THE OWNER'S OWN FACTS, AS GROUNDING ONLY — deliberately not run
  // through the claims strip on the way out.
  //
  // Measured on 2026-10-03 against this business's real catalogue: the
  // strip deletes "retails at ₹1,450, roughly 45% above your ₹999" and
  // "positions itself as India's largest home fragrance brand" in full,
  // because it checks every claim against what THIS business can back up
  // and a competitor's price and a competitor's own boast are, correctly,
  // not on our record. Those sentences are the findings. Stripping them
  // leaves Pricing Compare and SEO Comparison returning empty strings.
  //
  // So the competitor half is guarded by the citation check below — a
  // claim no cited page names is refused, which catches an invented price
  // and an invented contact detail alike — and the owner's own half is
  // guarded by putting the real catalogue in the prompt as verified fact.
  facts?: BusinessFacts | null
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

  // THIS IS WHERE THE SILENT FALLBACK ACTUALLY HAPPENS. All four tasks
  // here classify as COMPLEX, so the router genuinely wants Perplexity
  // and genuinely substitutes Claude when it isn't connected — the
  // Research Agent's own three tasks are STANDARD and were never routed
  // to Perplexity at all. The owner is told which one answered
  // (src/lib/research/provenance.ts) instead of it living in a
  // console.warn.
  let answeredBy: AnsweredBy = { provider: "claude_web_search", searchCap: "competitor_intel" };
  if (!routing.active && (routing.researchMode === "complex" || routing.researchMode === "deep")) {
    answeredBy = { ...answeredBy, intended: routing.researchMode === "deep" ? "perplexity_deep" : "perplexity", fellBackBecause: "not_connected" };
  }
  const prompt = `You are a competitive intelligence analyst working for "${dealershipName}", a ${businessCategory} business in India, researching their competitor "${competitorName}".${groundingContext ?? ""}

Task: ${meta.label}
${meta.instructions(competitorName, dealershipName, businessCategory)}

Only state something about ${competitorName} that you found on a page you can cite. Cite the page for every price, follower count, percentage or other figure — a figure that appears on no cited page is checked for afterwards and shown to the owner as unconfirmed, so guessing one makes the answer worse rather than fuller. If you cannot find a page about this competitor at all, say exactly that instead of answering from memory.

Return JSON only, no markdown, no preamble. Base your answer on what you actually find via search — never fabricate specific numbers, prices, or facts you didn't find. If information isn't publicly available, say so plainly in the relevant field.${factsPrompt(facts)}`;

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
        return { output: { ...JSON.parse(clean), _provider: answeredByNote({ provider: routing.provider as AnsweredBy["provider"] }) } };
      }
      console.warn("[competitor-intel-agent] perplexity returned no usable JSON — falling back to Claude web search.");
      answeredBy = { provider: "claude_web_search", searchCap: "competitor_intel", intended: routing.provider, fellBackBecause: "failed" };
    } catch (err: any) {
      console.warn("[competitor-intel-agent] perplexity failed, falling back to Claude web search:", err.message);
      answeredBy = { provider: "claude_web_search", searchCap: "competitor_intel", intended: routing.provider, fellBackBecause: "failed" };
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
    const parsed = JSON.parse(clean);

    // WHICH PAGE SAID SO. The right question about someone else's
    // business — see the note on `facts` above for why the claims strip
    // is the wrong one. Same filter Strategy's Positioning module uses:
    // a quote from a page that isn't about this competitor isn't its
    // claim (src/lib/competitors/citationCheck.ts).
    const check = checkCitations(r.data, { name: competitorName }, businessCategory, parsed);
    if (check.sources.length === 0) {
      // A refusal, not a warning. Every task here is "go and find out
      // what X does"; an answer assembled without one page about X is
      // recollection, and showing it beside a sourced answer teaches the
      // owner to trust both the same.
      return { output: { text: NOTHING_CITED }, _fallback: true };
    }

    const note = unverifiedNote(check.unverified);
    // Comparable or national, judged from the pages that were read. The
    // tiering has existed since 2026-09-20 and applied only on the
    // Strategy page — so this page, the one an owner opens to type a
    // name, read the same whether that name belonged to a neighbour or
    // to a brand in four hundred stores.
    const tier = tierFromSources(check.sources, parsed);
    return {
      output: {
        ...parsed,
        _provider: answeredByNote(answeredBy),
        _sources: check.sources,
        _tier: tier,
        ...(tier === "national" ? { _tierNote: NATIONAL_NOTE } : {}),
        ...(note ? { _unverified: note } : {}),
      },
    };
  } catch (err: any) {
    console.error("[competitor-intel-agent] error:", err.message);
    return fallback;
  }
}
