// Website CRO suggestions, built from the real live site and checked
// against it.
//
// Suggestions used to be generated from the landing_pages record — empty
// for anyone who built their site with the Website Builder — and the
// prompt invited "social proof" with nothing to base it on. The result
// told a one-order candle business to publish "Loved by 500+ homes
// across India". Now: the model is given only verified facts
// (siteFacts.ts) and truth rules, and every suggestion is checked
// against those facts before anyone sees it.

import { getModel } from "../models";
import { formatFactsForPrompt, scrubCroOutput, CRO_TRUTH_RULES, type CroFacts } from "../cro/siteFacts";
import { callClaude, withAiFailure, type AiFailureNote } from "@/lib/ai/claude";

export interface CroTaskMeta {
  key: string;
  label: string;
}

export const CRO_TASKS: CroTaskMeta[] = [
  { key: "landing_page", label: "Landing Page Optimization" },
  { key: "cta", label: "CTA Suggestions" },
  { key: "form", label: "Form Optimization" },
  { key: "ux", label: "UX Suggestions" },
];

export async function generateCroSuggestions(
  taskKey: string,
  facts: CroFacts,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; removed?: string[] }> {
  const meta = CRO_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = { output: { text: "Couldn't generate suggestions right now — try again shortly." }, _fallback: true };

  const instructions: Record<string, string> = {
    landing_page: `Suggest 4-5 specific improvements to the home page's headline, supporting copy and call to action. Return {"suggestions": [{"issue": "...", "fix": "...", "reasoning": "..."}]}. Refer to the real headline, copy and numbers above where they matter; if traffic is too low to judge, say so.`,
    cta: `Suggest 5 alternative call-to-action phrasings for the site, each with a different angle (urgency, curiosity, value, trust, direct offer). Any offer in them must be one listed in the facts. Return {"ctaOptions": [{"text": "...", "angle": "..."}]}.`,
    form: `Review the lead capture form (name, phone, and one optional interest field) and suggest concrete improvements — field order, what to make optional vs required, microcopy, and trust signals near the submit button that are TRUE per the facts. Return {"suggestions": [{"issue": "...", "fix": "..."}]}.`,
    ux: `Suggest 5 UX improvements for this site relevant to a ${facts.category} business — layout, mobile experience, page speed, visual hierarchy, and trust signals that are TRUE per the facts. Return {"suggestions": [{"issue": "...", "fix": "..."}]}.`,
  };

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 1800,
      messages: [
        {
          role: "user",
          content: `You are a conversion rate optimization specialist reviewing the real, live website of "${facts.businessName}", a ${facts.category} business in India.${groundingContext ?? ""}

${formatFactsForPrompt(facts)}

${CRO_TRUTH_RULES}

Task: ${meta.label}
${instructions[taskKey]}

Return JSON only, no markdown, no preamble. Be specific to this business's actual site and real numbers — never generic filler.`,
        },
      ],
    }, { operation: "cro_suggestions", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;

    // The rules above are instructions; this is the check. Anything that
    // still claims something the facts don't support is removed, and
    // the output says so.
    const { output, removed } = scrubCroOutput(JSON.parse(clean), facts);
    if (removed.length) console.warn("[cro-agent-v2] removed unsupported claims:", removed.join(" | "));
    return { output, removed };
  } catch (err: any) {
    console.error("[cro-agent-v2] error:", err.message);
    return fallback;
  }
}
