// Content Marketing Agent — covers all 20 tasks in one flexible
// generator instead of 20 separate agents: Instagram/LinkedIn/Twitter/
// Facebook/Threads posts, carousels, Pinterest pins, blog + SEO blog,
// email newsletters, product descriptions, landing/website copy, video/
// YouTube/Shorts scripts, reel ideas, hook generation, CTA generation,
// content calendar. Same Claude call pattern as the other agents:
// generous max_tokens, JSON-only response, full fallback, never cache
// a fallback in the API layer.

import { getModel } from "../models";
import { callClaude, aiFailureMessage, aiFailureNote, type AiFailureNote } from "@/lib/ai/claude";
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "@/lib/claims/businessFacts";
import { type ClaimsMode } from "@/lib/claims/claimCheck";
import { guardOrMark, truthBlock } from "@/lib/claims/factsGate";
import { resolveFestiveTopic } from "@/lib/expertise/seasonalCalendar";
import { STORY_CATEGORY } from "@/lib/business/businessStory";
// storyEcho is no longer imported here. After the inversion its
// usesOwnStory, storyForRetry and GENERIC_NOTE have NO production
// caller anywhere in src — said plainly rather than left for someone
// to discover. The module stays: storyVocabulary and textOfOutput are
// the base of antiGeneric and narrativeProvenance, and the three above
// are the intended machinery for About-type content, where the story
// IS the subject and the gate was always correct. Deleting working,
// tested code to express a change of mind is how a codebase loses what
// it later wants.
import { isGeneric, genericNote, retryBrief, type GenericVerdict } from "@/lib/content/antiGeneric";
import {
  askedForStory,
  customerFirstProblem,
  customerFirstNote,
  customerFirstBrief,
  tightenOutput,
  WORD_CAPS,
} from "@/lib/content/customerFirst";
import { soundRule, languageRule, normaliseLanguage, type CopyLanguage } from "@/lib/content/language";
import { applyLinkRule, linkRuleNote, applyBioRule, bioRuleNote } from "@/lib/content/platformRules";

// WHY THIS EXISTS (approved 2026-09-18): every caption came out in the
// same shape — hook line, product line, price, CTA, question — whatever
// was being promoted, and read as if it could belong to any business in
// the same category. Three causes, all addressed here:
//   1. the per-type instructions prescribed that shape;
//   2. nothing told the model to commit to ONE angle, so it covered
//      every base and landed on the safe average;
//   3. nothing showed it what it had already written, so it reached for
//      the same moves every time.
// The cure is never invention: specificity comes from the owner's own
// story facts (lib/business/businessStory.ts), which the claims guard
// already treats as verified.

/** One piece, one angle — committed to, not blended with the others. */
const ANGLES = [
  "the making — one real step of how this is made or done, in detail",
  "the material or ingredient — what it is, where it comes from, why this one",
  "the slow part — what takes longest or goes wrong, and why it's still done that way",
  "the person — the owner's own reason for doing this, in their words",
  "a customer moment — something a customer actually said or did",
  "the detail people notice — the small thing customers ask about",
  "what people get wrong — a misunderstanding about this kind of work, corrected plainly",
  "the use — what it's actually like to live with, on an ordinary day",
  "what we refuse to do — a shortcut not taken, and the cost of not taking it",
  "the occasion — why now, if today's date genuinely makes it relevant",
];

/** Openings and phrasings a reader has seen a thousand times. */
const TIRED_MOVES = [
  "Looking for X? Look no further",
  "Introducing / Meet the ...",
  "Elevate your ...",
  "Transform your ...",
  "Say goodbye to X, say hello to Y",
  "Perfect for ...",
  "Indulge in ...",
  "the perfect blend of X and Y",
  "crafted with love / made with love",
  "a touch of luxury / a slice of heaven",
  "Because you deserve ...",
  "Tag someone who ...",
  "Which one is your favourite? / Drop a ❤️ if ...",
  "Experience the difference",
  "Not just a X — it's a Y",
];

/**
 * The word cap, said as a number the model cannot read past.
 *
 * facebook_post's own instructions already said "80-150 words,
 * community-toned" and the live post on 11 October 2026 was 224. A range
 * inside a sentence of prose is a suggestion; a line of its own, with
 * the number twice, is an instruction - and overWordCap checks it
 * afterwards either way.
 */
function wordCapLine(contentType: string): string {
  const cap = WORD_CAPS[contentType];
  if (!cap) return "";
  return `
- LENGTH: at most ${cap} words. Not ${cap + 1}. If it does not fit, cut description, never a fact.`;
}

function angleFor(topic: string, recent: string[]): string {
  // Rotated, not random: successive pieces on the same topic get
  // different angles instead of the model's default favourite.
  const seed = `${topic}|${recent.length}`.split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100000, 7);
  const order = ANGLES.map((a, i) => ANGLES[(i + seed) % ANGLES.length]);
  return order.slice(0, 3).map((a, i) => `${i + 1}. ${a}`).join("\n");
}

/** The part of the prompt that asks for one committed angle and real specifics. */
export function craftSection(topic: string, recent: string[], hasStory: boolean, storyRequested = false): string {
  return `
## What this piece is about (read this before the format)
- WRITE IT FOR THE READER, not about the business. In this order:
  1. the customer's situation or what they want
  2. what the product does about it, from the verified facts
  3. the price or offer, if this piece needs one
  4. one clear next step
- ${
    storyRequested
      ? "The owner ASKED for their story, so this piece is the story. Use the recorded story facts above as the subject, and still end with one clear next step."
      : "The owner did NOT ask for their story. Their recorded story is information, not the subject: use AT MOST ONE short sentence of it, and only where it is real proof of something the reader cares about. A post that is mostly the owner talking about themselves is the wrong piece — it will be sent back."
  }
- Pick ONE angle and commit to it for the whole piece. Choose from these three, or a better one the facts suggest:
${angleFor(topic, recent)}
- Use at least one CONCRETE, specific detail from the verified facts — a step, a material, a place, a length of time, something a customer said. ${
    hasStory
      ? ""
      : "The owner hasn't written much down yet, so specifics are thin — write only what the facts support, stay plain, and don't pad with adjectives to fill the gap."
  }
- Use any owner detail as MATERIAL, not text to paste: take the fact, then write your own sentences about it for this reader. At most ONE short phrase (a few words) in the owner's exact words, where their phrasing is the point. Two pieces about the same fact should share the fact, never the sentences.
- SHORT DOES NOT MEAN GENERIC. However short the piece — "punchy", "one line", a Reel hook — the specific detail stays; everything else gets cut first. Compress it into a phrase instead of spending a sentence on it. A class whose teacher still marks every paper by hand: "har copy khud check hoti hai, isi liye batch chhota hai" says the real thing in a few extra words. "Quality education for your child" says nothing a competitor couldn't.
- Write it as one person telling another something true. No stacked adjectives, no rented enthusiasm.
- These openings and phrasings are worn out — never use them or anything close to them:
${TIRED_MOVES.map((m) => `  - ${m}`).join("\n")}
- Mention the price only if this particular piece needs it. A price is not a closing move.
- End the way this piece actually ends. A question is one option, not the default.${
    recent.length
      ? `\n- Recent pieces for this business — do NOT repeat their openings, rhythm or closing moves:\n${recent.map((r) => `  - "${r.replace(/\s+/g, " ").slice(0, 160)}"`).join("\n")}`
      : ""
  }`;
}

import { CONTENT_TYPES, type ContentTypeMeta } from "@/lib/departments/content";
import { parseModelJson } from "@/lib/ai/modelJson";
// Every piece of copy on this surface goes through the one door.
import { generateCopy } from "@/lib/content/generateCopy";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { CONTENT_TYPES };
export type { ContentTypeMeta };


interface BrandProfile {
  tone_of_voice?: string | null;
  target_persona?: any;
  messaging_pillars?: string[] | null;
  /** Settings → Brand → Preferred Ad Language. */
  preferred_language?: string | null;
}

export async function generateContent(
  contentTypeKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). When given, copy is written from them and checked against them. */
  facts?: BusinessFacts | null,
  /** "draft" when the owner reviews this before it's used: unverified prices are flagged, not removed. */
  claimsMode: ClaimsMode = "publish",
  opts: {
    /** The last few pieces written for this business, so this one doesn't repeat them. */
    recent?: string[];
    /** Second pass that cuts lines any business in the same category could have written. Pages where a human reviews; never the auto-publish path. */
    revise?: boolean;
    /**
     * Keep real links even for an Instagram content type. For callers that
     * post the same caption to Facebook too: Instagram's rule is applied
     * where the caption is posted to Instagram (postPhotoToInstagram).
     */
    keepLinks?: boolean;
  } = {}
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; priceWarnings?: string[]; substantiation?: string[]; revised?: boolean; publishable?: boolean; _cause?: string; _detail?: string; _malformed?: boolean; _incomplete?: boolean }> {
  const meta = CONTENT_TYPES.find((t) => t.key === contentTypeKey);
  if (!meta) return { output: { text: "Unknown content type." }, _fallback: true, _incomplete: true };

  // Said plainly, never a template dressed up as a draft.
  const fallback = { output: { text: aiFailureMessage("bad_request") }, _fallback: true };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "not set"}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand voice set yet — keep it natural and honest, avoid generic marketing-speak.";
  // The owner's own settings: what they chose beats what the facts sound
  // like (lib/content/language.ts). The page and chat both pass the brand
  // profile; the facts carry it too, for paths that don't.
  const language: CopyLanguage = normaliseLanguage(brandProfile?.preferred_language ?? facts?.brand?.language);
  const sound = soundRule(language, brandProfile?.tone_of_voice ?? facts?.brand?.tone);

  try {
    // PHASE 3.5, STEP 3. This agent had every measure in the codebase -
    // and had them as its OWN copy, which is exactly why no other
    // surface did. The pipeline now lives in generateCopy; what stays
    // here is the part that is genuinely about content: the link rule,
    // the bio rule, and the content-type table.
    const copy = await generateCopy({
      contentTypeKey,
      topic,
      businessName: dealershipName,
      businessCategory,
      facts,
      mode: claimsMode,
      revise: Boolean(opts.revise),
      // The ruthless copy-edit this path has paid for since
      // 2026-10-09. Still opt-in, so no other surface's cost changes.
      specificityPass: true,
      recent: opts.recent,
      language: brandProfile?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "content_generation",
      logContext,
      brief: {
        label: meta.label,
        labelPrefix: "Content type",
        instructions: meta.instructions,
        brandContext: `You are a senior content marketer.
${brandContext}
${sound}`,
        grounding: groundingContext ?? undefined,
        shapeHint: `Return JSON only, no markdown, no preamble. Shape the JSON sensibly for this content type (e.g. use "slides" array for carousels, "days" array for a content calendar, "hooks" array for hook generation, "ctas" array for CTA generation, otherwise a "text" field or clearly-named fields matching the requirements above). Be specific to this business and topic — never generic filler.`,
      },
    });
    // _incomplete TRAVELS OUT. The eighth S2a run of 2026-10-20 found
    // this missing on WhatsApp, where a case that failed closed was
    // counted as a case that ran; the test written for that found it
    // missing here too, on the surface S2c is going to use. Email had
    // it since 2026-10-16 and nobody carried it across.
    if (copy._aiFailure) return { output: copy.output, _fallback: true, _aiFailure: copy._aiFailure, _incomplete: copy.incomplete === true };
    if (copy._malformed) return { ...fallback, _cause: copy._cause, _detail: copy._detail, _malformed: true };
    if (copy.incomplete) return { output: copy.output, _fallback: true, _incomplete: true };
    if (copy._fallback) return { ...fallback, _incomplete: true };

    const linkRuleFor = opts.keepLinks ? "" : contentTypeKey;
    // Enforced, not requested: a real booking link in the facts is exactly
    // what put a dead URL into an Instagram caption.
    const linked = applyLinkRule(linkRuleFor, copy.output);
    // AND THE OTHER DIRECTION. A Facebook post that says "Link in bio."
    // sends the reader nowhere: there is no bio, and the link would have
    // worked. Replaced with the business's own store address when it has
    // one, removed when it does not, never invented.
    const bio = applyBioRule(linkRuleFor, linked.output, facts?.links?.store ?? null);
    const output: any = bio.output;
    const linkNote = linkRuleNote(linked.replaced);
    if (linkNote) output._claimsNote = [output._claimsNote, linkNote].filter(Boolean).join(" ");
    const bioNote = bioRuleNote(bio.fixed, bio.dropped);
    if (bioNote) output._claimsNote = [output._claimsNote, bioNote].filter(Boolean).join(" ");
    return {
      output,
      claimsRemoved: copy.removed,
      priceWarnings: copy.priceWarnings,
      substantiation: copy.substantiation,
      publishable: copy.publishable,
      ...(copy.revised ? { revised: true } : {}),
    };
  } catch (err: any) {
    console.error("[content-marketing-agent] error:", err.message);
    return { ...fallback, _incomplete: true };
  }
}

/**
 * The retry for a piece written about the business instead of the reader.
 *
 * Same mechanism as retryForSpecificity below, down to the shape check
 * and the tolerant JSON read: an EDIT at the same length, not a fresh
 * generation, because a regeneration drifts off the topic the owner
 * asked for.
 */
export async function retryForShape(
  draft: any,
  contentLabel: string,
  formatInstructions: string,
  problem: NonNullable<ReturnType<typeof customerFirstProblem>>,
  logContext?: { supabase: any; dealershipId: string },
  language: CopyLanguage = "hinglish"
): Promise<any | null> {
  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `This draft ${contentLabel} is the wrong shape for its reader. Fix the shape without inventing anything.

${customerFirstBrief(problem)}

Rewrite the draft:
- Keep the same JSON shape.
- ${languageRule(language)}
- The customer's situation first, then what the product does about it, then the price or offer if it needs one, then one clear next step.
- Never add a claim, a number, an offer or a testimonial that is not already in the draft.
- Keep the format's requirements: ${formatInstructions}

Draft JSON:
${JSON.stringify(draft).slice(0, 6000)}

Return the edited JSON only — same shape, no markdown, no commentary.`,
      }],
    }, { operation: "content_shape_retry", logContext });
    if (!r.ok) return null;
    const parsedReply = parseModelJson(r.text);
    if (!parsedReply.ok) {
      console.error(`[contentMarketingAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return null;
    }
    const retried = parsedReply.value;
    const sameShape = Object.keys(draft ?? {}).every((k) => k.startsWith("_") || k in retried);
    return sameShape ? retried : null;
  } catch (err: any) {
    console.error("[content-marketing-agent] shape retry failed:", err.message);
    return null;
  }
}

/**
 * The retry for a draft any competitor could have published: the same
 * piece, the same length, with one RECORDED SPECIFIC compressed in.
 *
 * Deliberately not "write it again": a fresh generation would drift off
 * the topic the owner asked for. This edits what's there, which is also
 * why it keeps the JSON shape.
 *
 * WAS retryWithStory, until 2026-10-09. The mechanism is unchanged, down
 * to the shape check and the tolerant JSON read — only its target moved,
 * from the founder's backstory to a product fact (P1). Renamed rather
 * than kept under the old name, because a function called retryWithStory
 * that no longer mentions the story is how the next reader is misled.
 */
export async function retryForSpecificity(
  draft: any,
  contentLabel: string,
  formatInstructions: string,
  verdict: GenericVerdict,
  facts: BusinessFacts | null | undefined,
  logContext?: { supabase: any; dealershipId: string },
  language: CopyLanguage = "hinglish"
): Promise<any | null> {
  // Nothing to retry TOWARD is not a failure to report — it is a
  // business that has recorded nothing yet, and a second model call
  // would produce the same words. Same early return storyForRetry gave.
  const brief = retryBrief(verdict, facts);
  if (!brief.trim()) return null;
  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `This draft ${contentLabel} could have been published by any business in the same line of work. Fix that, without inventing anything.

${brief}

Rewrite the draft:
- Keep the same JSON shape and the same length. This is a rewrite, not an expansion — if the detail needs room, cut a generic line to make it.
- ${languageRule(language)}
- Compress the detail into a phrase where the piece is short. A whole sentence about it is only for a piece that has room.
- Write about the customer and the product. Do NOT reach for the owner's personal history unless this piece is actually about it.
- Never invent anything: no claim, no number, no offer, no testimonial that is not listed above.
- Keep the format's requirements: ${formatInstructions}

Draft JSON:
${JSON.stringify(draft).slice(0, 6000)}

Return the edited JSON only — same shape, no markdown, no commentary.`,
      }],
    }, { operation: "content_specificity_retry", logContext });
    if (!r.ok) return null;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(r.text);
    if (!parsedReply.ok) {
      console.error(`[contentMarketingAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return null;
    }
    const retried = parsedReply.value;
    const sameShape = Object.keys(draft ?? {}).every((k) => k.startsWith("_") || k in retried);
    return sameShape ? retried : null;
  } catch (err: any) {
    console.error("[content-marketing-agent] specificity retry failed:", err.message);
    return null;
  }
}

/**
 * The second pass: cut every line that any business in the same line of
 * work could have written, and keep only what the verified facts support.
 *
 * Runs only where a person reads the result before it's used (the Content
 * Marketing page, the content queue) — never on the auto-publish path,
 * where a second call's cost buys nothing with no human in the loop.
 *
 * Returns null on any failure: the first draft beats nothing, so a
 * revision that doesn't come back is simply skipped.
 */
export async function reviseForSpecificity(
  draft: any,
  contentLabel: string,
  facts: BusinessFacts | null | undefined,
  logContext?: { supabase: any; dealershipId: string },
  language: CopyLanguage = "hinglish"
): Promise<any | null> {
  if (!facts) return null;
  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are a ruthless copy editor. Below is a draft ${contentLabel} for a real business, and the verified facts about that business.

THE TEST, line by line: could a competitor in the same line of work publish this exact line about themselves? If yes it is filler — cut it, or replace it with something only THIS business can say, taken from the facts.

Rules:
- Replace only with specifics that are IN the facts: a step, a material, a place, a length of time, something a customer said, the owner's own words. Never invent a detail, number, review, offer or claim — inventing one is worse than leaving the line out.
- Keep the same JSON shape and roughly the same length. No preamble.
- ${languageRule(language)}
- Cut stacked adjectives, rented enthusiasm and marketing throat-clearing. Plain and specific beats warm and vague.
- A line already specific to this business stays exactly as it is.

${formatFactsForCopy(facts)}

${COPY_TRUTH_RULES}

Draft JSON:
${JSON.stringify(draft).slice(0, 6000)}

Return the edited JSON only — same shape, no markdown, no commentary.`,
      }],
    }, { operation: "content_revision", logContext });
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
      console.error(`[contentMarketingAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return null;
    }
    const revised = parsedReply.value;
    // A revision that came back a different shape isn't a revision.
    const sameShape = Object.keys(draft ?? {}).every((k) => k.startsWith("_") || k in revised);
    return sameShape ? revised : null;
  } catch (err: any) {
    console.error("[content-marketing-agent] revision pass failed:", err.message);
    return null;
  }
}
