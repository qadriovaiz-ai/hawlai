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

import { CRO_TASKS, type CroTaskMeta } from "@/lib/departments/cro";
import { parseModelJson } from "@/lib/ai/modelJson";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { CRO_TASKS };
export type { CroTaskMeta };


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
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[croAgentV2] ${parsedReply.cause}: ${parsedReply.detail}`);
      return fallback;
    }

    // The rules above are instructions; this is the check. Anything that
    // still claims something the facts don't support is removed, and
    // the output says so.
    const { output, removed } = scrubCroOutput(parsedReply.value, facts);
    if (removed.length) console.warn("[cro-agent-v2] removed unsupported claims:", removed.join(" | "));
    return { output, removed };
  } catch (err: any) {
    console.error("[cro-agent-v2] error:", err.message);
    return fallback;
  }
}
