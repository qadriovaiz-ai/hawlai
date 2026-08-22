// ------------------------------------------------------------------
// Perplexity client — Usage/Pricing/Cost-Control spec, Section 4/6.
// ------------------------------------------------------------------
// Used ONLY for COMPLEX and DEEP research (see researchRouter.ts) —
// QUICK/STANDARD stay on Claude's own web search deliberately, to
// avoid a new provider cost where it isn't needed.
//
// CODE-READY BUT INACTIVE, same pattern as the Pinterest/Snapchat/
// LinkedIn ad connectors (P3 piece 6): fully implemented against
// Perplexity's documented Chat Completions API, but PERPLEXITY_API_KEY
// isn't set yet. isPerplexityConfigured() lets callers check before
// calling; callComplexResearch/callDeepResearch throw a clear,
// catchable error if called without a key so a caller that forgets to
// check fails loudly in development rather than silently.
//
// UNTESTED AGAINST A LIVE ACCOUNT — built from Perplexity's published
// API docs, not verified against a real request/response. Real
// pricing (input/output cost per token, per-request search cost) is
// deliberately NOT hardcoded anywhere in this file — that's the Cost
// Engine's job (Phase 2), stored in provider_costs after being
// verified from Perplexity's own current pricing page, never guessed.
// ------------------------------------------------------------------

const API_BASE = "https://api.perplexity.ai";

export function isPerplexityConfigured(): boolean {
  return !!process.env.PERPLEXITY_API_KEY;
}

export interface PerplexityResult {
  text: string;
  citations: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function callPerplexity(model: string, prompt: string, maxTokens: number): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY isn't set — check isPerplexityConfigured() before calling this.");
  }

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[perplexity] API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const citations: string[] = Array.isArray(data?.citations) ? data.citations : [];
  return {
    text,
    citations,
    model,
    inputTokens: data?.usage?.prompt_tokens ?? 0,
    outputTokens: data?.usage?.completion_tokens ?? 0,
  };
}

// COMPLEX — multi-source research (competitor comparison, pricing
// analysis, market positioning). sonar-pro is Perplexity's
// search-grounded model built for exactly this — broader, more
// current source coverage than a single web_search call.
export async function callComplexResearch(prompt: string, maxTokens = 2500): Promise<PerplexityResult> {
  return callPerplexity("sonar-pro", prompt, maxTokens);
}

// DEEP — Perplexity's Deep Research/Agent model, for genuinely
// extensive multi-source research reports (50+ sources, strategic
// market analysis). No call site uses this yet (see researchRouter.ts's
// header) — reachable only via an explicit requestedDepth override,
// ready for when Deep Research routing is built out (Phase 3).
export async function callDeepResearch(prompt: string, maxTokens = 4000): Promise<PerplexityResult> {
  return callPerplexity("sonar-deep-research", prompt, maxTokens);
}
