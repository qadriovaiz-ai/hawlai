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

function angleFor(topic: string, recent: string[]): string {
  // Rotated, not random: successive pieces on the same topic get
  // different angles instead of the model's default favourite.
  const seed = `${topic}|${recent.length}`.split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100000, 7);
  const order = ANGLES.map((a, i) => ANGLES[(i + seed) % ANGLES.length]);
  return order.slice(0, 3).map((a, i) => `${i + 1}. ${a}`).join("\n");
}

/** The part of the prompt that asks for one committed angle and real specifics. */
export function craftSection(topic: string, recent: string[], hasStory: boolean): string {
  return `
## How to write this (this matters more than the format)
- Pick ONE angle and commit to it for the whole piece. Choose from these three, or a better one the facts suggest:
${angleFor(topic, recent)}
- Use at least one CONCRETE, specific detail from the verified facts — a step, a material, a place, a length of time, something a customer said. ${
    hasStory
      ? "The owner's own story is in the facts above: use it. That detail is the whole point of the piece."
      : "The owner hasn't written their story down yet, so specifics are thin — write only what the facts support, stay plain, and don't pad with adjectives to fill the gap."
  }
- Use the owner's story as MATERIAL, not text to paste: take the fact, then write your own sentences about it for this reader. At most ONE short phrase (a few words) in the owner's exact words, where their phrasing is the point. Two pieces about the same fact should share the fact, never the sentences.
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
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[]; priceWarnings?: string[]; revised?: boolean ; _cause?: string; _detail?: string; _malformed?: boolean }> {
  const meta = CONTENT_TYPES.find((t) => t.key === contentTypeKey);
  if (!meta) return { output: { text: "Unknown content type." }, _fallback: true };

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
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a senior content marketer writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}${truthBlock(facts)}
Topic/product/context: "${resolveFestiveTopic(topic, facts?.season) || "general brand content, use good judgement for this business type"}"

${sound}

Content type: ${meta.label}
Output requirements: ${meta.instructions}
${craftSection(topic, opts.recent ?? [], Boolean(facts?.ownerFacts?.some((k) => k.category === STORY_CATEGORY)))}

Return JSON only, no markdown, no preamble. Shape the JSON sensibly for this content type (e.g. use "slides" array for carousels, "days" array for a content calendar, "hooks" array for hook generation, "ctas" array for CTA generation, otherwise a "text" field or clearly-named fields matching the requirements above). Be specific to this business and topic — never generic filler.`,
        },
      ],
    }, { operation: "content_generation", logContext });
    if (!r.ok) return { output: { text: aiFailureMessage(r.failure.kind) }, _fallback: true, _aiFailure: aiFailureNote(r.failure) };
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
      // F-22: the fallback used to go back as a plain `_fallback` whose
      // output was a sentence, and the chat then had to notice it was
      // not copy. The parser's own account travels with it now, so the
      // chat can say what actually happened instead of guessing
      // (the system prompt's `_cause` / `_detail` rule).
      return { ...fallback, _cause: parsedReply.cause, _detail: parsedReply.detail, _malformed: true };
    }
    let parsed = parsedReply.value;
    let revised = false;
    if (opts.revise) {
      const second = await reviseForSpecificity(parsed, meta.label, facts, logContext, language);
      if (second) {
        parsed = second;
        revised = true;
      }
    }

    // THE INVERSION (2026-10-09, P1 in docs/PRINCIPLES.md).
    //
    // This block used to ask "did the piece use the owner's STORY?" and
    // retry toward the founder's backstory when it had not. The retry
    // machinery was right; the thing it retried TOWARD was wrong. A
    // caption about a Diwali offer has no business carrying a
    // batch-ruining anecdote, and forcing it produced sentences no buyer
    // asked for.
    //
    // It now asks "could any business in this line of work have
    // published this?" — a worn opener, or no recorded specific at all
    // (lib/content/antiGeneric.ts). The CONTROL FLOW IS DELIBERATELY
    // UNCHANGED: one retry, keep the retry's answer even when it still
    // fails, tell the owner either way, and never retry a business with
    // nothing to retry toward. That shape is what six integration tests
    // pin, and keeping it is what lets them keep testing something real.
    let generic = false;
    // THE VERDICT IS FREE, THE REPAIR IS NOT.
    //
    // isGeneric is pure code, so it runs everywhere: even the
    // unattended path tells the owner, on the Content Marketing page,
    // that a caption read like anyone's.
    //
    // The RETRY is a model call, and it is gated behind the same
    // `revise` flag as reviseForSpecificity because of an existing test
    // named "without the flag there is no second call - the auto-publish
    // path stays single-shot", asserting calls === 1. That is a written
    // contract and it outranks my own judgement about whether the call
    // is worth it. It also closes a pre-existing hole: the story retry
    // this replaces was NOT gated, so it broke that same contract
    // whenever a business had recorded a story - the test only passed
    // because its fixture had none.
    const verdict = isGeneric(parsed, facts, language);
    if (verdict.generic) {
      const retried = opts.revise
        ? await retryForSpecificity(parsed, meta.label, meta.instructions, verdict, facts, logContext, language)
        : null;
      if (retried && !isGeneric(retried, facts, language).generic) parsed = retried;
      else {
        if (retried) parsed = retried;
        generic = true;
      }
    }
    // `_storyNote` keeps its name on purpose: GeneratedOutputPanel and
    // the chat card both read that key, and renaming it would silently
    // stop the owner seeing any of this. What CHANGED is the words.
    if (generic) parsed = { ...parsed, _storyNote: genericNote(verdict) };
    const linkRuleFor = opts.keepLinks ? "" : contentTypeKey;
    // F-01: this used to be `if (!facts) return parsed` — the guard
    // skipped and the output indistinguishable from a checked draft.
    // guardOrMark runs the full guard when the records are readable and
    // the fact-independent subset when they are not, and marks which
    // happened either way (src/lib/claims/factsGate.ts).
    const guarded = guardOrMark(parsed, facts, claimsMode);
    // Enforced, not requested: a real booking link in the facts is exactly
    // what put a dead URL into an Instagram caption.
    const linked = applyLinkRule(linkRuleFor, guarded.output);
    // AND THE OTHER DIRECTION. A Facebook post that says "Link in bio."
    // sends the reader nowhere: there is no bio, and the link would have
    // worked. Replaced with the business's own store address when it has
    // one, removed when it does not, never invented.
    // With no facts there is no store address to swap a bio line for, so
    // the rule drops the dead sentence rather than inventing a URL.
    const bio = applyBioRule(linkRuleFor, linked.output, facts?.links?.store ?? null);
    const output: any = bio.output;
    const linkNote = linkRuleNote(linked.replaced);
    if (linkNote) output._claimsNote = [output._claimsNote, linkNote].filter(Boolean).join(" ");
    const bioNote = bioRuleNote(bio.fixed, bio.dropped);
    if (bioNote) output._claimsNote = [output._claimsNote, bioNote].filter(Boolean).join(" ");
    return { output, claimsRemoved: guarded.removed, priceWarnings: guarded.priceWarnings, ...(revised ? { revised } : {}) };
  } catch (err: any) {
    console.error("[content-marketing-agent] error:", err.message);
    return fallback;
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
