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
  { key: "competitor_keywords", label: "Competitor Keywords", instructions: "Exactly 10 realistic keywords/search terms competitors in this business category and city are probably ranking for or targeting — roughly half informational (research/comparison intent, e.g. \"best X near me\") and half transactional (ready-to-buy intent, e.g. \"book X online\"). Return as {\"keywords\": [{\"keyword\": \"...\", \"intent\": \"informational\" | \"transactional\", \"note\": \"one short sentence on why this keyword matters or what the searcher wants\"}]} — this exact shape, since it's rendered as a two-column card, not read as raw JSON." },
  { key: "internal_linking", label: "Internal Linking", instructions: "5 internal linking suggestions for a small business website in this category — return {anchorText, linksTo, why} objects describing realistic page-to-page links (e.g. blog post -> service page) that would help SEO and user navigation." },
  { key: "meta_tags", label: "Meta Tags", instructions: "Meta title (under 60 chars) and meta description (under 160 chars) for the homepage of this business, keyword-aware and click-worthy, not generic." },
  { key: "schema", label: "Schema Markup", instructions: "A valid JSON-LD schema.org markup block appropriate for this business type (e.g. LocalBusiness or a more specific subtype), including name, description placeholder, address placeholder, and relevant fields. Return as a 'jsonLd' field containing the ready-to-paste JSON-LD object as a string." },
  { key: "site_speed", label: "Site Speed Suggestions", instructions: "6 concrete, prioritized site speed improvement suggestions relevant to a small business site (image optimization, hosting, caching, etc), each with {suggestion, impact} — impact being High/Medium/Low." },
  { key: "backlink_strategy", label: "Backlink Strategy", instructions: "6 realistic backlink-building tactics for a small local Indian business in this category (e.g. local directories, industry partnerships, guest posts, press) — each with {tactic, howTo}, practical and not spammy." },
  { key: "local_seo", label: "Local SEO", instructions: "6 local SEO action items specific to this business and city — NAP consistency, local citations, location pages, local keyword targeting, review strategy etc, each with {action, why}." },
  { key: "gbp_optimization", label: "Google Business Profile", instructions: "A Google Business Profile optimization checklist for this business: suggested business description (under 750 chars), 5 relevant GBP categories/attributes to add, and 3 post ideas to publish on the profile. Return as {description, categories: [], postIdeas: []}." },
  // Registered here so it's chat-reachable via generate_seo's taskType
  // enum and appears in the SEO page's task picker with zero new tool
  // registration and zero new navigation (see the approved AEO
  // architecture proposal, Task 1) — but its `instructions` field is
  // documentation only. Actual execution is NOT generateSeoTask()
  // below (a single templated Claude call can't do this): it's
  // dispatched to generateAeoCheck() in aeoAgent.ts, which needs live
  // web search plus a structural read of the business's own site.
  // Special-cased at both call sites — /api/seo/toolkit/route.ts and
  // masterBrainV2.ts's "generate_seo" case.
  { key: "aeo_check", label: "AEO Check", instructions: "Checks how this business shows up when someone asks an AI assistant (ChatGPT/Gemini/Perplexity-style) a buying question in its category — a different mechanism from Google ranking. Dispatched to generateAeoCheck(), not this generic task runner." },
];

interface DealershipContext {
  tone_of_voice?: string | null;
}

import { getModel } from "../models";
import { callClaude, withAiFailure, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";
import { formatQueriesForPrompt } from "@/lib/seo/searchQueries";
import type { QueryRow } from "@/lib/seo/searchConsole";

/**
 * What to ask for INSTEAD of the static instruction, once this business's
 * real search terms are available (migration 201).
 *
 * The static instruction for competitor_keywords asks for keywords
 * competitors are "probably" ranking for — a guess, politely worded.
 * With Search Console connected there is no need to guess: the terms
 * people actually typed are in the prompt, with Google's own counts.
 */
const REAL_DATA_INSTRUCTIONS: Record<string, string> = {
  competitor_keywords:
    `Work ONLY from the real search terms given above. Return the 10 most worth acting on as {"keywords": [{"keyword": "...", "intent": "informational" | "transactional", "note": "one short sentence on what that term's own numbers show and what to do about it — quote the impressions, clicks or position exactly as given"}]}. Prefer terms the business is already seen for but never clicked on, and terms sitting just below the top of the results, because those are the ones already earning attention. Never add a term that is not in the list above, and never state a search volume or a ranking figure that is not printed there.`,
};

export async function generateSeoTask(
  taskKey: string,
  dealershipName: string,
  city: string | null,
  businessCategory: string,
  brandProfile?: DealershipContext | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** This business's real Search Console terms, when it has connected one. */
  searchTerms: QueryRow[] = []
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote }> {
  const meta = SEO_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  // Real data replaces the guess where there is real data, and the task
  // falls back to its old wording where there isn't — an owner with no
  // Search Console connection still gets the same help as before.
  const searchSection = formatQueriesForPrompt(searchTerms);
  const requirements = searchSection && REAL_DATA_INSTRUCTIONS[taskKey] ? REAL_DATA_INSTRUCTIONS[taskKey] : meta.instructions;

  const fallback = {
    output: { text: aiFailureMessage("bad_request") },
    _fallback: true,
  };

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 1800,
      messages: [{
        role: "user",
        content: `You are an SEO specialist working on an Indian ${businessCategory} business called "${dealershipName}"${city ? `, based in ${city}` : ""}.
${brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : ""}${groundingContext ?? ""}${searchSection ? `

${searchSection}` : ""}

Task: ${meta.label}
Requirements: ${requirements}

Return JSON only, no markdown, no preamble. Shape the JSON to match the requirements exactly (use the field names implied above). Be specific to this business type and city — never generic filler, and never invent fake statistics or ranking data.`,
      }],
    }, { operation: "seo_task", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[seo-toolkit-agent] error:", err.message);
    return fallback;
  }
}
