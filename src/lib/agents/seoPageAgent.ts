// Generates standalone SEO content pages — distinct from the single
// hero landing page (Website page), these target specific keywords/
// services/locations (e.g. "2BHK flats in Sector 45" for a real
// estate business, "used SUV financing" for a car dealership) so the
// business shows up for more search queries than one generic page
// can rank for.

export interface SeoPageContent {
  title: string;
  metaDescription: string;
  h1: string;
  sections: { heading: string; body: string }[];
  slug: string;
}

import { getModel } from "../models";
import { callClaude, aiFailureNote, type AiFailureNote } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";

export async function generateSeoPage(
  topic: string,
  dealershipName: string,
  businessCategory: string,
  city: string | null,
  logContext?: { supabase: any; dealershipId: string },
  /** VERIFIED FACTS + truth rules for this business (src/lib/claims). */
  grounding?: string
): Promise<{ output: SeoPageContent | null; _fallback?: boolean; _aiFailure?: AiFailureNote }> {
  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Write an SEO-focused content page for "${dealershipName}", a ${businessCategory} business${city ? ` in ${city}` : ""}, targeting the topic/keyword: "${topic}".

Return JSON only: {"title": "SEO title tag, under 60 chars, includes the keyword", "metaDescription": "under 160 chars, click-worthy", "h1": "the on-page H1, can differ slightly from title", "sections": [{"heading": "...", "body": "2-4 sentences"}] (4-5 sections covering this topic thoroughly), "slug": "url-friendly-slug-for-this-topic"}

Write real, specific, useful content for this topic and business — not generic filler. Never invent statistics, prices, or claims that aren't reasonable for this business type.
${grounding ?? ""}`,
      }],
    }, { operation: "seo_page", logContext });
    if (!r.ok) return { output: null, _fallback: true, _aiFailure: aiFailureNote(r.failure) };
    const text = r.text;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[seoPageAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return { output: null, _fallback: true };
    }
    return { output: parsedReply.value };
  } catch (err: any) {
    console.error("[seo-page-agent] error:", err.message);
    return { output: null, _fallback: true };
  }
}
