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
// The live site's own words: one door.
import { generateCopy } from "@/lib/content/generateCopy";
import { type BusinessFacts } from "@/lib/claims/businessFacts";

export async function generateLandingPageCopy(
  dealershipName: string,
  city: string | null,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  /** The business's own records. Was a pre-built prompt string, which is why this path had no guard. */
  facts?: BusinessFacts | null
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
    // PHASE 3.5, STEP 7. THIS IS THE LIVE SITE. Until today it had no
    // check on its output: the prompt said "never an offer, discount or
    // 'free' anything unless the verified facts list it" and nothing
    // enforced it.
    const copy = await generateCopy({
      topic: `landing page copy for ${dealershipName}`,
      businessName: dealershipName,
      businessCategory,
      facts,
      // The owner reviews the page before publishing it.
      mode: "draft",
      revise: true,
      language: brandProfile?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "landing_page_copy",
      logContext,
      maxTokens: 400,
      brief: {
        label: "landing page copy",
        instructions: `Write landing page copy for this business${city ? ` in ${city}` : ""}.`,
        brandContext: brandContext,
        shapeHint: `Return JSON only: {"headline":"under 60 chars, punchy","subheadline":"under 120 chars, builds trust","offer_text":"under 80 chars, a clear call-to-action that fits what this business actually sells — booking, ordering, visiting or enquiring, whichever applies. Never an offer, discount or 'free' anything unless the verified facts list it."}`,
      },
    });
    if (copy._aiFailure) return withAiFailure(fallback, { kind: copy._aiFailure.kind } as any);
    if (copy._fallback) return fallback;
    const parsed = copy.output;
    return {
      headline: String(parsed.headline ?? "").trim() || fallback.headline,
      // A field the guard emptied comes back EMPTY, not invented: the
      // caller tells the owner to write it. An empty field the owner
      // fills is recoverable; a confident wrong sentence on their live
      // page is not.
      subheadline: String(parsed.subheadline ?? "").trim(),
      offer_text: String(parsed.offer_text ?? "").trim(),
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
