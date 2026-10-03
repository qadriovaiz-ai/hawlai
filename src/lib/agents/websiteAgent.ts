// ------------------------------------------------------------------
// Website Agent — basic landing page copy
// ------------------------------------------------------------------
// Generates headline/subheadline/offer copy for a dealership's public
// landing page, using the same Brand Profile as every other agent so
// tone stays consistent site-wide.
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

export interface LandingPageCopy {
  headline: string;
  subheadline: string;
  offer_text: string;
}

import { getModel } from "../models";
import { callClaude, withAiFailure } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";

export async function generateLandingPageCopy(
  dealershipName: string,
  city: string | null,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  /** VERIFIED FACTS + truth rules for this business (src/lib/claims). */
  grounding?: string
): Promise<LandingPageCopy> {
  const fallback: LandingPageCopy = {
    headline: `${dealershipName} — Your Trusted Car Partner${city ? ` in ${city}` : ""}`,
    subheadline: "Best deals, honest advice, and a hassle-free buying experience.",
    offer_text: "Book a free test drive today.",
  };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Key points to include if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "No brand profile set — default to a warm, professional tone in Hinglish.";

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Write landing page copy for an Indian ${businessCategory} business called "${dealershipName}"${city ? ` in ${city}` : ""}.
${brandContext}
Return JSON only: {"headline":"under 60 chars, punchy","subheadline":"under 120 chars, builds trust","offer_text":"under 80 chars, a clear call-to-action like booking a test drive"}
${grounding ?? ""}`,
        },
      ],
    }, { operation: "landing_page_copy", logContext });
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
      console.error(`[websiteAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return fallback;
    }
    const parsed = parsedReply.value;
    return {
      headline: parsed.headline ?? fallback.headline,
      subheadline: parsed.subheadline ?? fallback.subheadline,
      offer_text: parsed.offer_text ?? fallback.offer_text,
    };
  } catch (err: any) {
    console.error("[website-agent] generateLandingPageCopy error:", err.message);
    return fallback;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
