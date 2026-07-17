// Competitor Intelligence Agent — Competitor Ads tracking already
// exists (Research page, Meta Ad Library). This covers Social Media
// Monitor, Pricing Compare, SEO Comparison, and Content Gap Analysis
// — all use Claude's web_search tool so results reflect what's
// actually publicly findable right now, not guessed from training
// data. New Product Alerts is a separate real monitoring system, see
// lib/automation/competitorMonitor.ts.

export interface CompetitorTaskMeta {
  key: string;
  label: string;
  instructions: (competitor: string, business: string, category: string) => string;
}

export const COMPETITOR_TASKS: CompetitorTaskMeta[] = [
  {
    key: "social_media_monitor",
    label: "Social Media Monitor",
    instructions: (c, b, cat) => `Search for ${c}'s recent social media activity (Instagram, Facebook, or LinkedIn — whichever is most active for a ${cat} business). Summarize what they've been posting about recently, their apparent posting frequency, and any notable campaigns or announcements. Return {recentActivity, postingPattern, notableCampaigns: []}. Base this on what you actually find — if you can't find much, say so honestly rather than guessing.`,
  },
  {
    key: "pricing_compare",
    label: "Pricing Compare",
    instructions: (c, b, cat) => `Search for ${c}'s publicly listed pricing for their ${cat} offerings. Return {competitorPricing: [{item, price, source}], comparisonNotes} — comparisonNotes should note what's genuinely comparable to ${b}'s likely offerings and flag anything uncertain. If exact pricing isn't publicly available, say so rather than inventing numbers.`,
  },
  {
    key: "seo_comparison",
    label: "SEO Comparison",
    instructions: (c, b, cat) => `Search for how ${c} shows up in search results for their core ${cat} keywords — what pages rank, what their meta titles/descriptions look like, and what content they seem to be targeting. Return {rankingSignals: [], contentFocus, opportunityNotes} — this is a qualitative comparison based on visible search results, not real backlink/traffic data (that would need a paid SEO tool this doesn't have access to).`,
  },
  {
    key: "content_gap",
    label: "Content Gap Analysis",
    instructions: (c, b, cat) => `Search for the kind of content ${c} publishes (blog posts, guides, videos) for their ${cat} business. Compare that against what a business like ${b} would typically need to cover. Return {competitorContentTopics: [], gapsFound: [{topic, why}]} — gapsFound should be topics the competitor covers that ${b} likely doesn't yet, based on what you find.`,
  },
];

export async function generateCompetitorIntel(
  taskKey: string,
  competitorName: string,
  dealershipName: string,
  businessCategory: string
): Promise<{ output: any; _fallback?: boolean }> {
  const meta = COMPETITOR_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: `Couldn't complete ${meta.label.toLowerCase()} for ${competitorName} right now — try again shortly.` },
    _fallback: true,
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: `You are a competitive intelligence analyst working for "${dealershipName}", a ${businessCategory} business in India, researching their competitor "${competitorName}".

Task: ${meta.label}
${meta.instructions(competitorName, dealershipName, businessCategory)}

Return JSON only, no markdown, no preamble. Base your answer on what you actually find via search — never fabricate specific numbers, prices, or facts you didn't find. If information isn't publicly available, say so plainly in the relevant field.`,
        }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    const text = (data.content ?? [])
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
