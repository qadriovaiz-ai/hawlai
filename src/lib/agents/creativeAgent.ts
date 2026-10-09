// ------------------------------------------------------------------
// Creative Agent — Phase 1 expansion
// ------------------------------------------------------------------
// So far Creative Agent only made static ad images (template or
// Gemini AI background). This adds two text-based capabilities that
// need no image processing:
//  1. Short-form video/reel scripts (scene-by-scene, for Instagram
//     Reels / YouTube Shorts style content)
//  2. Multiple ad-copy variations for the same idea, so a dealer can
//     A/B test angles (urgency vs trust vs price) before picking one
//     to actually launch as an ad.
// ------------------------------------------------------------------

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

export interface VideoScene {
  scene_number: number;
  visual: string;
  voiceover_or_caption: string;
  duration_seconds: number;
}

export interface VideoScript {
  title: string;
  total_duration_seconds: number;
  scenes: VideoScene[];
  /**
   * Set when nothing could be written. Empty `scenes` plus this is the
   * honest shape; the previous fallback was a car-showroom script that
   * a sweet shop could not tell apart from a real one.
   */
  fallbackReason?: string;
}

export interface CopyVariation {
  angle: string;
  headline: string;
  body: string;
  score: number;
}

function brandContextFor(brandProfile?: BrandProfile | null): string {
  return brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Key points to weave in if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "No brand profile set — default to a warm, professional tone in Hinglish.";
}

import { getModel } from "../models";
import { callClaude } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";

async function askClaudeJson(prompt: string, maxTokens: number, operation: string, logContext?: { supabase: any; dealershipId: string }): Promise<any | null> {
  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }, { operation, logContext });
    if (!r.ok) return null;
    const text = r.text;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[creativeAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return null;
    }
    return parsedReply.value;
  } catch (err: any) {
    console.error("[creative-agent] askClaudeJson error:", err.message);
    return null;
  }
}

export async function generateVideoScript(
  topic: string,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  /** VERIFIED FACTS + truth rules for this business (src/lib/claims). */
  grounding?: string
): Promise<VideoScript> {
  // NO SCRIPT RATHER THAN THE WRONG BUSINESS'S SCRIPT.
  //
  // This fallback was a car showroom: "Wide shot of the car in the
  // showroom", "Packed with everything you need", "Book your test drive
  // today!". A sweet shop asking for a Reel script got a car advert, and
  // a model failure was indistinguishable from a real script.
  //
  // Only the topic the owner typed is known here without a model call,
  // so the fallback is one scene built from it and nothing else — no
  // invented feature, no invented action, no invented urgency. The
  // caller sees `scenes.length === 1` and `fallbackReason`, and says so.
  const fallback: VideoScript = {
    title: topic,
    total_duration_seconds: 0,
    scenes: [],
    fallbackReason: "Hawlai couldn't write the script just now, so nothing was invented. Ask again and it will try afresh.",
  };

  const parsed = await askClaudeJson(
    `You are a short-form video scriptwriter for an Indian ${businessCategory} business's Instagram Reels / YouTube Shorts.
Topic: "${topic}"
${brandContextFor(brandProfile)}

Write a 15-30 second video script, 3-6 scenes. Return JSON only:
{"title":"short title for the video","total_duration_seconds":number,"scenes":[{"scene_number":1,"visual":"what the camera shows, one short sentence","voiceover_or_caption":"what's said or shown as on-screen text, one short sentence","duration_seconds":number}]}
${grounding ?? ""}`,
    600,
    "video_script",
    logContext
  );

  if (!parsed || !Array.isArray(parsed.scenes)) return fallback;
  return {
    title: parsed.title ?? fallback.title,
    total_duration_seconds: parsed.total_duration_seconds ?? fallback.total_duration_seconds,
    scenes: parsed.scenes,
  };
}

export async function generateCopyVariations(
  topic: string,
  brandProfile?: BrandProfile | null,
  count: number = 3,
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  /** VERIFIED FACTS + truth rules for this business (src/lib/claims). */
  grounding?: string
): Promise<CopyVariation[]> {
  // THE WORST FALLBACK IN THE FILE, and it shipped as ad copy.
  //
  // "Limited Stock!" is a stock claim nothing on record supports;
  // "offer ends soon" is an invented offer AND invented urgency; "Book
  // your test drive" is the wrong business. All three are exactly what
  // the claims guard exists to strip, written in by hand where the
  // guard never ran.
  //
  // An empty list is the honest answer: the caller reports that nothing
  // could be written rather than handing the owner a variation to run.
  const fallback: CopyVariation[] = [];

  const parsed = await askClaudeJson(
    `You are an ad copywriter for an Indian ${businessCategory} business, A/B testing different angles for the same offer.
Topic: "${topic}"
${brandContextFor(brandProfile)}

Write ${count} DISTINCT ad copy variations, each taking a different angle (e.g. urgency, trust/credibility, price/value, lifestyle/aspiration — pick whichever ${count} fit best). For each, also give an honest 0-100 confidence score for how well it will convert with Indian customers — be genuinely critical and vary the scores based on real strength, not uniformly high. Return JSON only:
{"variations":[{"angle":"short label for the angle used","headline":"under 40 chars, in Hinglish","body":"under 125 chars, in Hinglish","score":number}]}
${grounding ?? ""}`,
    700,
    "copy_variations",
    logContext
  );

  if (!parsed || !Array.isArray(parsed.variations)) return fallback;
  return parsed.variations;
}

// ------------------------------------------------------------------
// Phase 3 addition: product descriptions — pure text generation, no
// new dependencies. (Blog posts live in seoAgent.ts, generated from
// there instead, to avoid having two separate blog generators.)
// ------------------------------------------------------------------

export interface ProductDescription {
  title: string;
  description: string;
  highlights: string[];
}

export async function generateProductDescription(
  itemName: string,
  details: string,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  /** VERIFIED FACTS + truth rules for this business (src/lib/claims). */
  grounding?: string
): Promise<ProductDescription> {
  const fallback: ProductDescription = {
    title: itemName,
    description: `Discover the ${itemName} — available now. Contact us for full details and pricing.`,
    highlights: [],
  };
  const parsed = await askClaudeJson(
    `Write a product/service listing description for an Indian ${businessCategory} business.
Item: "${itemName}"
Details provided: "${details}"
${brandContextFor(brandProfile)}
Return JSON only:
{"title":"short listing title","description":"2-3 sentence description, honest and specific to what was given, not generic","highlights":["4-5 short bullet-point features, based on the details given"]}
${grounding ?? ""}`,
    500,
    "product_description",
    logContext
  );
  if (!parsed) return fallback;
  return {
    title: parsed.title ?? fallback.title,
    description: parsed.description ?? fallback.description,
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
  };
}
