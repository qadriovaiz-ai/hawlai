// ------------------------------------------------------------------
// Deep Strategy Agent — completes the Marketing Strategy department
// ------------------------------------------------------------------
// Covers everything the monthly roadmap (strategyAgent.ts) doesn't:
// SWOT, market gaps, explicit USP/positioning, pricing strategy,
// product analysis, multiple customer personas, and both quarterly
// and annual horizons — not just the monthly view. One consolidated
// call since these all draw on the same business context rather than
// being independent lookups.
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  target_persona?: any;
  messaging_pillars?: string[] | null;
}

export interface Persona {
  name: string;
  description: string;
  painPoints: string[];
}

export interface DeepStrategy {
  productAnalysis: string;
  pricingStrategy: string;
  positioningStatement: string;
  usp: string;
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  marketGaps: string[];
  personas: Persona[];
  quarterlyPlan: { quarter: string; focus: string; keyActions: string[] }[];
  annualGrowthPlan: string;
}

export async function generateDeepStrategy(
  dealershipName: string,
  city: string | null,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "car dealership",
  competitorContext?: string | null
): Promise<DeepStrategy> {
  const fallback: DeepStrategy = {
    productAnalysis: "Add a Brand Voice description first so this can be tailored to your actual offering.",
    pricingStrategy: "Consider value-based pricing with a clear entry-level offer to reduce first-purchase friction.",
    positioningStatement: `${dealershipName} is a trusted, local ${businessCategory} focused on straightforward, honest service.`,
    usp: "Reliable local service with transparent pricing.",
    swot: {
      strengths: ["Local presence and community trust"],
      weaknesses: ["Limited brand profile set up so far"],
      opportunities: ["Growing digital ad reach"],
      threats: ["Competitors with larger ad budgets"],
    },
    marketGaps: ["Fill in your Brand Voice for a sharper, more specific gap analysis"],
    personas: [{ name: "Primary Customer", description: "A local customer looking for a reliable option", painPoints: ["Trust", "Price transparency"] }],
    quarterlyPlan: [
      { quarter: "Q1", focus: "Foundation", keyActions: ["Set up Brand Voice", "Launch first campaigns"] },
      { quarter: "Q2", focus: "Growth", keyActions: ["Scale what's working", "Expand to new audiences"] },
    ],
    annualGrowthPlan: "Focus the first two quarters on establishing consistent lead flow, then reinvest proven-profitable campaigns into scale during the second half of the year.",
  };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "not set"}. Target persona: ${JSON.stringify(brandProfile.target_persona ?? {})}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand profile set yet — give reasonable, honest defaults for this business category rather than inventing specifics.";

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
        max_tokens: 1400,
        messages: [
          {
            role: "user",
            content: `You are a senior marketing strategist doing a full strategic analysis for an Indian ${businessCategory} business called "${dealershipName}"${city ? ` in ${city}` : ""}.
${brandContext}
${competitorContext ? `Known competitor activity: ${competitorContext}` : "No competitor data available — note this honestly rather than inventing specifics."}

Return JSON only, no markdown:
{
"productAnalysis":"2-3 sentences on what they're likely offering and how it fits the local market",
"pricingStrategy":"2-3 sentences of concrete pricing approach advice for this business type",
"positioningStatement":"one sharp, specific positioning statement (the 'for X who need Y, we are Z' style)",
"usp":"one clear, specific unique selling proposition — not generic",
"swot":{"strengths":["2-3 honest items"],"weaknesses":["2-3 honest items"],"opportunities":["2-3 honest items"],"threats":["2-3 honest items"]},
"marketGaps":["2-3 specific gaps or underserved angles this business could exploit locally"],
"personas":[{"name":"short persona name","description":"1-2 sentences","painPoints":["2-3 items"]}] (2-3 distinct personas, not just one),
"quarterlyPlan":[{"quarter":"Q1","focus":"theme","keyActions":["2-3 concrete actions"]}] (4 quarters, Q1 through Q4),
"annualGrowthPlan":"3-4 sentences describing the year's overall trajectory and how quarters build on each other"
}
Be specific and honest — a small local business's SWOT should not read like a Fortune 500's. If data is thin, say so within the fields rather than inventing corporate-sounding fluff.`,
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
      productAnalysis: parsed.productAnalysis ?? fallback.productAnalysis,
      pricingStrategy: parsed.pricingStrategy ?? fallback.pricingStrategy,
      positioningStatement: parsed.positioningStatement ?? fallback.positioningStatement,
      usp: parsed.usp ?? fallback.usp,
      swot: {
        strengths: Array.isArray(parsed.swot?.strengths) ? parsed.swot.strengths : fallback.swot.strengths,
        weaknesses: Array.isArray(parsed.swot?.weaknesses) ? parsed.swot.weaknesses : fallback.swot.weaknesses,
        opportunities: Array.isArray(parsed.swot?.opportunities) ? parsed.swot.opportunities : fallback.swot.opportunities,
        threats: Array.isArray(parsed.swot?.threats) ? parsed.swot.threats : fallback.swot.threats,
      },
      marketGaps: Array.isArray(parsed.marketGaps) ? parsed.marketGaps : fallback.marketGaps,
      personas: Array.isArray(parsed.personas) && parsed.personas.length > 0 ? parsed.personas : fallback.personas,
      quarterlyPlan: Array.isArray(parsed.quarterlyPlan) && parsed.quarterlyPlan.length > 0 ? parsed.quarterlyPlan : fallback.quarterlyPlan,
      annualGrowthPlan: parsed.annualGrowthPlan ?? fallback.annualGrowthPlan,
    };
  } catch (err: any) {
    console.error("[deep-strategy-agent] error:", err.message);
    return fallback;
  }
}
