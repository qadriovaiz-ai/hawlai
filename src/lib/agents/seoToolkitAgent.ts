// SEO Toolkit Agent — covers the tasks not already handled by
// seoAgent.ts (which does keyword research + blog post generation)
// or api/seo/audit (technical audit) or api/cro (CRO suggestions):
// competitor keywords, internal linking, meta tags, schema markup,
// site speed suggestions, backlink strategy, local SEO, Google
// Business Profile optimization. Same flexible-generator pattern as
// contentMarketingAgent.ts / videoMarketingAgent.ts.

export interface SeoTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

export const SEO_TASKS: SeoTaskMeta[] = [
  { key: "competitor_keywords", label: "Competitor Keywords", instructions: "10 likely keywords/search terms competitors in this business category and city are probably ranking for or targeting, grouped by intent (informational vs transactional) if useful." },
  { key: "internal_linking", label: "Internal Linking", instructions: "5 internal linking suggestions for a small business website in this category — return {anchorText, linksTo, why} objects describing realistic page-to-page links (e.g. blog post -> service page) that would help SEO and user navigation." },
  { key: "meta_tags", label: "Meta Tags", instructions: "Meta title (under 60 chars) and meta description (under 160 chars) for the homepage of this business, keyword-aware and click-worthy, not generic." },
  { key: "schema", label: "Schema Markup", instructions: "A valid JSON-LD schema.org markup block appropriate for this business type (e.g. LocalBusiness or a more specific subtype), including name, description placeholder, address placeholder, and relevant fields. Return as a 'jsonLd' field containing the ready-to-paste JSON-LD object as a string." },
  { key: "site_speed", label: "Site Speed Suggestions", instructions: "6 concrete, prioritized site speed improvement suggestions relevant to a small business site (image optimization, hosting, caching, etc), each with {suggestion, impact} — impact being High/Medium/Low." },
  { key: "backlink_strategy", label: "Backlink Strategy", instructions: "6 realistic backlink-building tactics for a small local Indian business in this category (e.g. local directories, industry partnerships, guest posts, press) — each with {tactic, howTo}, practical and not spammy." },
  { key: "local_seo", label: "Local SEO", instructions: "6 local SEO action items specific to this business and city — NAP consistency, local citations, location pages, local keyword targeting, review strategy etc, each with {action, why}." },
  { key: "gbp_optimization", label: "Google Business Profile", instructions: "A Google Business Profile optimization checklist for this business: suggested business description (under 750 chars), 5 relevant GBP categories/attributes to add, and 3 post ideas to publish on the profile. Return as {description, categories: [], postIdeas: []}." },
];

interface DealershipContext {
  tone_of_voice?: string | null;
}

export async function generateSeoTask(
  taskKey: string,
  dealershipName: string,
  city: string | null,
  businessCategory: string,
  brandProfile?: DealershipContext | null
): Promise<{ output: any; _fallback?: boolean }> {
  const meta = SEO_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: `${meta.label} draft for ${dealershipName}${city ? ` in ${city}` : ""}. Regenerate once the API is available for a tailored version.` },
    _fallback: true,
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        messages: [{
          role: "user",
          content: `You are an SEO specialist working on an Indian ${businessCategory} business called "${dealershipName}"${city ? `, based in ${city}` : ""}.
${brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : ""}

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. Shape the JSON to match the requirements exactly (use the field names implied above). Be specific to this business type and city — never generic filler, and never invent fake statistics or ranking data.`,
        }],
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
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[seo-toolkit-agent] error:", err.message);
    return fallback;
  }
}
