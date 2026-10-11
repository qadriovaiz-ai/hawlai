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
// A published page is customer-facing copy: one door.
import { generateCopy } from "@/lib/content/generateCopy";
import { type BusinessFacts } from "@/lib/claims/businessFacts";

export async function generateSeoPage(
  topic: string,
  dealershipName: string,
  businessCategory: string,
  city: string | null,
  logContext?: { supabase: any; dealershipId: string },
  /** The business's own records. Was a pre-built prompt string, which is why this path had no guard. */
  facts?: BusinessFacts | null
): Promise<{ output: SeoPageContent | null; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; publishable?: boolean }> {
  try {
    // PHASE 3.5, STEP 6. A PUBLISHED PAGE, and until today it had no
    // check on its output at all. Its own prompt said "never invent
    // statistics, prices, or claims that aren't reasonable for this
    // business type" - an instruction, with nothing behind it.
    const copy = await generateCopy({
      topic,
      businessName: dealershipName,
      businessCategory,
      facts,
      // The owner reviews the page before it is published.
      mode: "draft",
      revise: true,
      language: facts?.brand?.language ?? null,
      operation: "seo_page",
      logContext,
      brief: {
        label: "SEO content page",
        instructions: `Targeting the topic/keyword: "${topic}". Write real, specific, useful content for this topic and business — not generic filler. 4-5 sections covering the topic thoroughly.`,
        brandContext: `Write an SEO-focused content page for a ${businessCategory} business${city ? ` in ${city}` : ""}.`,
        shapeHint: `Return JSON only: {"title": "SEO title tag, under 60 chars, includes the keyword", "metaDescription": "under 160 chars, click-worthy", "h1": "the on-page H1, can differ slightly from title", "sections": [{"heading": "...", "body": "2-4 sentences"}], "slug": "url-friendly-slug-for-this-topic"}`,
      },
    });
    if (copy._aiFailure) return { output: null, _fallback: true, _aiFailure: copy._aiFailure };
    if (copy._fallback) return { output: null, _fallback: true };
    return { output: copy.output as SeoPageContent, claimsRemoved: copy.removed, publishable: copy.publishable };
  } catch (err: any) {
    console.error("[seo-page-agent] error:", err.message);
    return { output: null, _fallback: true };
  }
}
