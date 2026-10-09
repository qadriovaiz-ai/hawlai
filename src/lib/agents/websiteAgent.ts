// ------------------------------------------------------------------
// Website Agent — basic landing page copy
// ------------------------------------------------------------------
// Generates headline/subheadline/offer copy for a business's public
// landing page, using the same Brand Profile as every other agent so
// tone stays consistent site-wide. Nothing here is category-specific:
// businessCategory arrives as a parameter and the copy follows it.
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
  // A FALLBACK IS BUILT FROM THE BUSINESS'S OWN NAME, OR IT IS NOTHING.
  //
  // This file is from the car-dealership era and its fallback still read
  // "Your Trusted Car Partner", "Best deals, honest advice, and a
  // hassle-free buying experience" and "Book a free test drive today."
  // For a sweet shop or a coaching centre that is three wrong sentences;
  // for anyone it is two invented CLAIMS ("best deals", "honest advice")
  // and an invented OFFER ("free") that nothing on record supports.
  //
  // The name and the city are the only things known here without a
  // model call, so they are the only things the fallback may use. The
  // other two fields come back empty and the caller tells the owner to
  // write them — an empty field the owner fills is recoverable, a
  // confident wrong sentence on their live page is not.
  const fallback: LandingPageCopy = {
    headline: city ? `${dealershipName} — ${city}` : dealershipName,
    subheadline: "",
    offer_text: "",
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
Return JSON only: {"headline":"under 60 chars, punchy","subheadline":"under 120 chars, builds trust","offer_text":"under 80 chars, a clear call-to-action that fits what this business actually sells — booking, ordering, visiting or enquiring, whichever applies. Never an offer, discount or 'free' anything unless the verified facts list it."}
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
      headline: String(parsed.headline ?? "").trim() || fallback.headline,
      subheadline: String(parsed.subheadline ?? "").trim() || fallback.subheadline,
      offer_text: String(parsed.offer_text ?? "").trim() || fallback.offer_text,
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
