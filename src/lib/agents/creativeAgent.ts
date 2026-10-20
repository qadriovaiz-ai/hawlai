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
// All three generators here write customer-facing copy: one door.
import { generateCopy } from "@/lib/content/generateCopy";
import type { TaskKind } from "@/lib/facts/getContext";
import { type BusinessFacts } from "@/lib/claims/businessFacts";

/**
 * PHASE 3.5, STEP 7. All three generators in this file write
 * customer-facing copy - a product listing, ad variations, a Reel
 * script - and none of them had any check on its output. Each took its
 * facts as a pre-built prompt string, which is why: a string can be put
 * in a prompt but it cannot be checked against.
 *
 * This replaces askClaudeJson for all three. The prompts are unchanged;
 * they are just handed to the door as a brief instead of being sent
 * straight to the model.
 */
async function askThroughDoor(
  opts: {
    topic: string;
    label: string;
    instructions: string;
    shapeHint: string;
    businessCategory: string;
    brandProfile?: BrandProfile | null;
    facts?: BusinessFacts | null;
    maxTokens: number;
    operation: string;
    logContext?: { supabase: any; dealershipId: string };
    /**
     * Opt this ONE caller onto the fact-bound pipeline.
     *
     * PER-CALLER AND NOT PER-HELPER, deliberately. Three functions
     * share askThroughDoor - a video script, copy variations and a
     * product listing - and turning the pipeline on here would turn it
     * on for all three at once, changing the cost and behaviour of two
     * surfaces nobody has measured. S2 covers the listing; the other
     * two wait their turn.
     */
    factBound?: boolean;
    task?: TaskKind;
  }
): Promise<any | null> {
  const copy = await generateCopy({
    topic: opts.topic,
    businessName: opts.facts?.businessName ?? "this business",
    businessCategory: opts.businessCategory,
    facts: opts.facts,
    // The owner reviews all three of these before using them.
    mode: "draft",
    revise: true,
    language: (opts.brandProfile as any)?.preferred_language ?? opts.facts?.brand?.language ?? null,
    operation: opts.operation,
    factBound: opts.factBound === true,
    task: opts.task,
    logContext: opts.logContext,
    maxTokens: opts.maxTokens,
    brief: {
      label: opts.label,
      instructions: opts.instructions,
      brandContext: brandContextFor(opts.brandProfile),
      shapeHint: opts.shapeHint,
    },
  });
  if (copy._fallback) return null;
  return copy.output;
}


export async function generateVideoScript(
  topic: string,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  /** The business's own records. Was a pre-built prompt string, which is why this path had no guard. */
  facts?: BusinessFacts | null
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

  const parsed = await askThroughDoor({
    topic,
    label: "short-form video script",
    instructions: `You are a short-form video scriptwriter for Instagram Reels / YouTube Shorts.
Topic: "${topic}"

Write a 15-30 second video script, 3-6 scenes.`,
    shapeHint: `Return JSON only:
{"title":"short title for the video","total_duration_seconds":number,"scenes":[{"scene_number":1,"visual":"what the camera shows, one short sentence","voiceover_or_caption":"what's said or shown as on-screen text, one short sentence","duration_seconds":number}]}`,
    businessCategory,
    brandProfile,
    facts,
    maxTokens: 600,
    operation: "video_script",
    logContext,
  });

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
  /** The business's own records. Was a pre-built prompt string, which is why this path had no guard. */
  facts?: BusinessFacts | null
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

  const parsed = await askThroughDoor({
    topic,
    label: "A/B ad copy variations",
    instructions: `You are an ad copywriter A/B testing different angles for the same offer.
Topic: "${topic}"

Write ${count} DISTINCT ad copy variations, each taking a different angle (e.g. urgency, trust/credibility, price/value, lifestyle/aspiration — pick whichever ${count} fit best). For each, also give an honest 0-100 confidence score for how well it will convert with Indian customers — be genuinely critical and vary the scores based on real strength, not uniformly high.`,
    shapeHint: `Return JSON only:
{"variations":[{"angle":"short label for the angle used","headline":"under 40 chars, in Hinglish","body":"under 125 chars, in Hinglish","score":number}]}`,
    businessCategory,
    brandProfile,
    facts,
    maxTokens: 700,
    operation: "copy_variations",
    logContext,
  });

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
  /** The business's own records. Was a pre-built prompt string, which is why this path had no guard. */
  facts?: BusinessFacts | null
): Promise<ProductDescription> {
  const fallback: ProductDescription = {
    title: itemName,
    description: `Discover the ${itemName} — available now. Contact us for full details and pricing.`,
    highlights: [],
  };
  const parsed = await askThroughDoor({
    topic: itemName,
    label: "product listing description",
    instructions: `Write a product/service listing description.
Item: "${itemName}"
Details provided: "${details}"`,
    shapeHint: `Return JSON only:
{"title":"short listing title","description":"2-3 sentence description, honest and specific to what was given, not generic","highlights":["4-5 short bullet-point features, based on the details given"]}`,
    businessCategory,
    brandProfile,
    facts,
    maxTokens: 500,
    operation: "product_description",
    // S2d: the fourth and last customer-facing surface on the
    // fact-bound pipeline. Does nothing unless FACT_BOUND_COPY=1.
    //
    // DIFFERENT IN KIND FROM THE OTHER THREE, as PLAN-S2 §2 said before
    // any of this was built. The others send a message and it is gone;
    // this one edits a resource that SITS on the live storefront until
    // somebody changes it, so an invented spec stays visible rather
    // than scrolling away. src/lib/publish/ owns that path, and the
    // verification has to happen BEFORE a preview is built - an owner
    // approving a preview is approving what they were shown.
    //
    // `page_text` because that is what a storefront listing is. The
    // kind does not change which records are selected - getContext
    // narrows by TOPIC, not by kind - so this is a label for the owner
    // and for the sheet rather than a behavioural switch, and it should
    // say the true thing.
    factBound: true,
    task: "page_text",
    logContext,
  });
  if (!parsed) return fallback;
  return {
    title: parsed.title ?? fallback.title,
    description: parsed.description ?? fallback.description,
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
  };
}
