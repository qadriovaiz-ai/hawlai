// AEO/GEO Agent — Answer Engine Optimization check, the 9th SEO task.
// Structurally different from the other 8 (generateSeoTask's single-
// template-prompt pattern in seoToolkitAgent.ts can't fit this): needs
// live web search to simulate buyer-intent AI-answer checks, plus a
// real structural read of the business's own Hawlai-built site content
// when one exists — pulled directly from website_pages, no HTTP fetch
// needed. See the approved architecture proposal for the reasoning
// behind every design choice below (placement, mechanism, honesty
// framing, artifact shape).

import { logClaudeUsage } from "../usage/logUsage";
import { getModel } from "../models";

export interface AeoCheckResult {
  visibilityScore: number;
  scoreLabel: string;
  scoreBreakdown: { label: string; value: string }[];
  competitivePositioning: { promptTested: string; mentioned: boolean; competitorsMentioned: string[] }[];
  recommendations: { title: string; detail: string }[];
  disclosure: string;
}

interface DealershipContext {
  tone_of_voice?: string | null;
}

// Fixed, not LLM-generated — this must be accurate and present every
// single time the check runs, not dependent on the model remembering
// to word it correctly. This is the verified-vs-simulated distinction
// from the architecture proposal (Task 2), rendered directly in the
// output rather than left as a code comment only.
const DISCLOSURE =
  "Simulated using Claude's own live web search — not a direct query of ChatGPT, Gemini, or Perplexity, which Hawlai has no API access to. Directionally useful for spotting gaps, not a guarantee of how any specific AI assistant will actually answer.";

// Generic prop-value text dump rather than parsing the exact block
// schema field-by-field — robust to whichever prop field names a given
// block type uses (heading/body/text/etc.), and all we need is real
// text to judge, not a structured re-render of the page.
function extractPlainText(sections: any[]): string {
  const parts: string[] = [];
  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.props && typeof node.props === "object") {
      for (const v of Object.values(node.props)) {
        if (typeof v === "string" && v.trim().length > 3) parts.push(v.trim());
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  }
  (sections ?? []).forEach(walk);
  return parts.join(" ").slice(0, 2500);
}

export async function generateAeoCheck(
  dealershipName: string,
  city: string | null,
  businessCategory: string,
  brandProfile?: DealershipContext | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string
): Promise<{ output: AeoCheckResult; _fallback?: boolean }> {
  const fallback = {
    output: {
      visibilityScore: 0,
      scoreLabel: "Content citability",
      scoreBreakdown: [],
      competitivePositioning: [],
      recommendations: [{ title: "Try again", detail: "Couldn't complete the check — regenerate once the API is available." }],
      disclosure: DISCLOSURE,
    },
    _fallback: true,
  };

  // Real structural content when a Hawlai-built site exists. Businesses
  // without one (an external site Hawlai has no URL for, or no site at
  // all) get a lower-confidence, category-general assessment instead of
  // a fabricated one — never claim to have analyzed a page that was
  // never actually read.
  let siteContext = "";
  let hasSite = false;
  if (logContext) {
    try {
      const { data: website } = await logContext.supabase.from("websites").select("id").eq("dealership_id", logContext.dealershipId).maybeSingle();
      if (website) {
        const { data: pages } = await logContext.supabase.from("website_pages").select("slug, page_type, sections, updated_at").eq("website_id", website.id);
        const homePage = (pages ?? []).find((p: any) => p.slug === "home" || p.page_type === "home") ?? (pages ?? [])[0];
        const hasFaqPage = (pages ?? []).some((p: any) => p.page_type === "faq");
        if (homePage) {
          hasSite = true;
          const text = extractPlainText(homePage.sections);
          const daysSinceUpdate = homePage.updated_at ? Math.floor((Date.now() - new Date(homePage.updated_at).getTime()) / 86400000) : null;
          siteContext = `\n\nThis business's actual homepage content (via Hawlai's website builder) — judge this for real, don't invent a generic assessment:\n"""${text || "(page has no text content yet)"}"""\nFAQ-type page exists: ${hasFaqPage ? "yes" : "no"}.\nHomepage last updated: ${daysSinceUpdate != null ? `${daysSinceUpdate} days ago` : "unknown"}.`;
        }
      }
    } catch {
      // Best-effort — a lookup failure just means the check runs without
      // structural site content, not that the whole check fails.
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: getModel("standard"),
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: `You're running an Answer Engine Optimization (AEO) check for "${dealershipName}", a ${businessCategory} business in India${city ? ` (${city})` : ""} — checking how this business shows up when someone asks an AI assistant a buying question in this category, which is a different mechanism from traditional Google ranking.${brandProfile?.tone_of_voice ? ` Brand tone: ${brandProfile.tone_of_voice}.` : ""}${groundingContext ?? ""}${siteContext}

Do this in order:

1. Generate 3-4 realistic buyer-intent questions someone in India would actually ask an AI assistant when deciding on a ${businessCategory}${city ? ` in ${city}` : ""} — mix a plain category-recommendation phrasing with at least one value/trust-framed phrasing ("best affordable...", "is [category] worth it"), not just the single most literal wording.
2. For EACH question, use web search to find out what's genuinely being said about businesses in this category/city right now, then judge: would "${dealershipName}" plausibly be named in a synthesized answer to that question, and which other real businesses/brands would likely be named instead or alongside it. Base this on what you actually find — never invent that a business was mentioned somewhere it wasn't, and say so plainly if you can't find enough to judge either way.
3. ${hasSite ? "Score this business's actual homepage content (given above) for AI-answer-engine citability" : "Give a lower-confidence, category-general citability assessment — no actual site content was available to analyze"} against these signals: does it open with a direct-answer statement rather than a slow build-up; is there FAQ-style content; how fresh is the content; is there any structured/schema-markup signal. Produce an overall 0-100 score.
4. Write 3-5 concrete, structural recommendations (not generic marketing advice) to improve citability — ground these in whatever AEO/GEO knowledge appears in the context above if present, rather than generic knowledge.

Return JSON only, no markdown, no preamble, this exact shape:
{"visibilityScore": <0-100 integer>, "scoreLabel": "Content citability", "scoreBreakdown": [{"label": "...", "value": "..."}], "competitivePositioning": [{"promptTested": "...", "mentioned": <bool>, "competitorsMentioned": ["..."]}], "recommendations": [{"title": "...", "detail": "..."}]}`,
        }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "aeo_check", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    return {
      output: {
        visibilityScore: Math.max(0, Math.min(100, Number(parsed.visibilityScore) || 0)),
        scoreLabel: String(parsed.scoreLabel || "Content citability"),
        scoreBreakdown: Array.isArray(parsed.scoreBreakdown) ? parsed.scoreBreakdown : [],
        competitivePositioning: Array.isArray(parsed.competitivePositioning) ? parsed.competitivePositioning : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        disclosure: DISCLOSURE,
      },
    };
  } catch (err: any) {
    console.error("[aeo-agent] error:", err.message);
    return fallback;
  }
}
