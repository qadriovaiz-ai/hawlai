// SEO Toolkit Agent — covers the tasks not already handled by
// seoAgent.ts (which does keyword research + blog post generation)
// or api/seo/audit (technical audit) or api/cro (CRO suggestions):
// competitor keywords, internal linking, meta tags, schema markup,
// site speed suggestions, backlink strategy, local SEO, Google
// Business Profile optimization. Same flexible-generator pattern as
// contentMarketingAgent.ts / videoMarketingAgent.ts.

import { SEO_TASKS, type SeoTaskMeta } from "@/lib/departments/seo";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { SEO_TASKS };
export type { SeoTaskMeta };


interface DealershipContext {
  tone_of_voice?: string | null;
}

import { getModel } from "../models";
import { callClaude, withAiFailure, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";
import { formatQueriesForPrompt } from "@/lib/seo/searchQueries";
import { flattenResultText } from "./brandVoiceValidation";
import { guardGenerated } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
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

/**
 * The owner's own words, kept exactly as the owner wrote them.
 *
 * WHY THIS IS ENFORCED IN CODE AND NOT JUST ASKED FOR IN THE PROMPT
 * (2026-09-28): an owner pasted their own line — handmade candles "made
 * by hand in Shahjahanpur", ending "Shop now." — and asked for it as
 * their meta description. What came back said "Uttar Pradesh" instead of
 * the town, replaced "Shop now" with a brand slogan, and explained that
 * a character limit required it. The text was about 150 characters. The
 * limit is 160.
 *
 * A model asked nicely not to rewrite something will still sometimes
 * rewrite it, so the prompt asks AND this checks. If the owner's line
 * does not come back character for character, the owner's line is what
 * gets returned.
 */
function keepOwnerWords(taskKey: string, output: any, exactText?: string): any {
  const wanted = exactText?.trim();
  if (!wanted || !output || typeof output !== "object") return output;
  if (flattenResultText(output).includes(wanted)) return output;

  // meta_tags is the one task with an unambiguous home for a line of
  // prose. Elsewhere it is returned alongside, so nothing the model
  // wrote is thrown away and the owner's words are still there in full.
  return taskKey === "meta_tags"
    ? { ...output, metaDescription: wanted, _ownerWordsRestored: true }
    : { ...output, ownerText: wanted, _ownerWordsRestored: true };
}

export async function generateSeoTask(
  taskKey: string,
  dealershipName: string,
  city: string | null,
  businessCategory: string,
  brandProfile?: DealershipContext | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** This business's real Search Console terms, when it has connected one. */
  searchTerms: QueryRow[] = [],
  /** Copy the owner wrote and asked to be used as-is. Never edited. */
  exactText?: string,
  /**
   * This business's real facts, so claims it cannot support are removed.
   *
   * SEO copy went out unguarded until 2026-09-29, while Content, Email,
   * Ads, Retargeting and WhatsApp all ran through the same check — and a
   * meta description is read by more strangers than most captions.
   * Optional: without facts the task behaves exactly as it did.
   */
  facts?: BusinessFacts | null
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
${exactText?.trim() ? `
THE OWNER HAS GIVEN YOU THEIR OWN WORDING. Use it exactly as written, character for character, in the field it belongs to:
"""
${exactText.trim()}
"""
Do not shorten it, rewrite it, translate it, tidy its punctuation, or swap any word in it — a town stays that town, a product name stays that product name, and a call to action stays theirs. If it is genuinely longer than the field allows, still return it unchanged and add a "lengthNote" field saying the real count and the real limit. Never claim a limit forced a change.
` : ""}
Return JSON only, no markdown, no preamble. Shape the JSON to match the requirements exactly (use the field names implied above). Be specific to this business type and city — never generic filler, and never invent fake statistics or ranking data.`,
      }],
    }, { operation: "seo_task", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;

    // ORDER MATTERS, and it is the whole of decision C (2026-09-29):
    // the guard runs on what HAWLAI wrote, and the owner's own wording
    // is restored afterwards. Stripping a claim the owner typed himself
    // would contradict the verbatim rule this task already keeps — his
    // sentence is his to make, and the card warns instead.
    const generated = JSON.parse(clean);
    const guarded = facts ? guardGenerated(generated, facts, "draft") : { output: generated, removed: [] as string[] };
    const output = keepOwnerWords(taskKey, guarded.output, exactText);
    return { output, ...(guarded.removed.length ? { claimsRemoved: guarded.removed } : {}) };
  } catch (err: any) {
    console.error("[seo-toolkit-agent] error:", err.message);
    return fallback;
  }
}
