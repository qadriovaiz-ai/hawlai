// ------------------------------------------------------------------
// Research Router — Usage/Pricing/Cost-Control spec, Section 5-6.
// ------------------------------------------------------------------
// Decides HOW DEEP a web-research request should go (quick/standard/
// complex/deep) and WHICH provider handles it, given the caller's
// plan and the kind of task being asked for. This is a pure decision
// function — it makes no network calls itself.
//
// VERIFIED before building: every existing web-research call site in
// this codebase (researchAgentV2, competitorIntelAgent, aeoAgent,
// competitorMonitor, topicMonitor, socialManagementAgent's trends
// task — 6 files total) already uses Claude's own built-in
// `web_search_20250305` tool exclusively. There is no separate
// Gemini-search integration anywhere. Per the confirmed decision,
// this router does NOT add one either — QUICK/STANDARD stay on
// Claude's own web search (avoids a new provider cost where none is
// needed); only COMPLEX/DEEP reach for Perplexity.
//
// Provider selection by level, per the confirmed decision:
//   quick, standard -> claude_web_search (no new cost)
//   complex         -> perplexity
//   deep            -> perplexity_deep (Perplexity Deep Research/Agent)
// Perplexity itself is code-ready-but-inactive until PERPLEXITY_API_KEY
// is set (see perplexityClient.ts) — same pattern as the Pinterest/
// Snapchat/LinkedIn ad connectors. Until then, complex/deep requests
// transparently fall back to Claude's own web search rather than
// failing outright.
//
// Task-type -> default level mapping was derived from auditing what
// each of the 6 existing call sites actually does today, not guessed:
//   - competitor_watch, topic_watch, social_trends: background
//     automation, one quick news lookup, no cross-source synthesis
//     -> QUICK
//   - industry_trends, market_research, new_opportunities
//     (researchAgentV2's dashboard research tasks): a single broader
//     topic scan -> STANDARD
//   - social_media_monitor, pricing_compare, seo_comparison,
//     content_gap (competitorIntelAgent), aeo_visibility (aeoAgent):
//     multi-source competitive research -> COMPLEX
// DEEP has no existing call site — nothing in the app asks for
// "50+ source market research" today. It's defined here so the type
// system and routing logic are ready for it, reachable only via an
// explicit requestedDepth override, per Phase 3's "Deep Research
// routing" being separately scoped later.

import type { PlanKey } from "../plans";

export type ResearchLevel = "quick" | "standard" | "complex" | "deep";
export type ResearchProvider = "claude_web_search" | "perplexity" | "perplexity_deep";

export interface ResearchRouterInput {
  plan: PlanKey;
  taskType: string;
  requestedDepth?: ResearchLevel;
}

export interface ResearchRouterOutput {
  provider: ResearchProvider;
  researchMode: ResearchLevel;
  reason: string;
  // Real cost/usage metering is the Cost Engine's job (Phase 2,
  // Section 8) — not duplicated here. null is honest: "not yet
  // metered," never a made-up number.
  estimatedCost: number | null;
  estimatedUsage: number | null;
  // False when the chosen provider can't actually run right now
  // (Perplexity without an API key) and the router has silently
  // substituted claude_web_search instead.
  active: boolean;
}

const TASK_LEVELS: Record<string, ResearchLevel> = {
  competitor_watch: "quick",
  topic_watch: "quick",
  social_trends: "quick",

  industry_trends: "standard",
  market_research: "standard",
  new_opportunities: "standard",

  social_media_monitor: "complex",
  pricing_compare: "complex",
  seo_comparison: "complex",
  content_gap: "complex",
  aeo_visibility: "complex",
};

// Free plan's research ceiling — confirmed decision: QUICK only, full
// stop. This downgrades STANDARD requests too (not just COMPLEX/DEEP)
// — Free tier having the same research depth as paying Basic/Growth
// customers, restricted only from Perplexity, would blur the actual
// paid-tier differentiation. If STANDARD should stay available on
// Free, this is the one line to change.
const FREE_MAX_LEVEL: ResearchLevel = "quick";
const LEVEL_RANK: Record<ResearchLevel, number> = { quick: 0, standard: 1, complex: 2, deep: 3 };

export function classifyResearch(input: ResearchRouterInput): ResearchRouterOutput {
  const requestedLevel = input.requestedDepth ?? TASK_LEVELS[input.taskType] ?? "quick";

  if (input.plan === "free" && LEVEL_RANK[requestedLevel] > LEVEL_RANK[FREE_MAX_LEVEL]) {
    return {
      provider: "claude_web_search",
      researchMode: FREE_MAX_LEVEL,
      reason: `Downgraded from ${requestedLevel} to quick — the Free plan's research is capped there.`,
      estimatedCost: null,
      estimatedUsage: null,
      active: true,
    };
  }

  if (requestedLevel === "quick" || requestedLevel === "standard") {
    return {
      provider: "claude_web_search",
      researchMode: requestedLevel,
      reason: `${requestedLevel} research uses Claude's own web search — no separate provider needed.`,
      estimatedCost: null,
      estimatedUsage: null,
      active: true,
    };
  }

  const perplexityReady = !!process.env.PERPLEXITY_API_KEY;
  const provider: ResearchProvider = requestedLevel === "deep" ? "perplexity_deep" : "perplexity";

  if (!perplexityReady) {
    return {
      provider: "claude_web_search",
      researchMode: requestedLevel,
      reason: `${requestedLevel} research would normally use Perplexity for broader source coverage, but it isn't connected yet — falling back to Claude's own web search.`,
      estimatedCost: null,
      estimatedUsage: null,
      active: false,
    };
  }

  return {
    provider,
    researchMode: requestedLevel,
    reason: `${requestedLevel} research uses Perplexity for broader/deeper source coverage than a single web search provides.`,
    estimatedCost: null,
    estimatedUsage: null,
    active: true,
  };
}
