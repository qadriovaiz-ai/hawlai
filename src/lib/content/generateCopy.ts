// ONE DOOR FOR EVERY PIECE OF CUSTOMER-FACING COPY.
//
// WHY THIS FILE EXISTS. Every protection in this codebase was written
// inside the generator I happened to be looking at, so each new one
// started life on exactly one path. Measured on 2026-10-11, before this
// file:
//
//   claims + provenance        18 of 29 copy paths
//   customer-first structure    1
//   word cap                    1
//   anti-generic                1
//   specificity editor          1
//
// That is F-16, the shape behind the 8 October Facebook incident and
// the 11 October founder-story post, and I committed it three times
// while fixing it. A guard inside a generator protects that generator.
// A guard inside a door protects everything that comes through.
//
// WHAT THIS IS NOT. It is not a prompt library and it does not know
// what an email or a Facebook post should say - each surface passes its
// own brief. What the door owns is the ORDER of the checks and the fact
// that none of them can be skipped.
//
// THE ORDER, and what each step is here because of:
//
//   1. truthBlock(facts)          F-01: the truth rules are a static
//                                 string and must survive a failed
//                                 records read
//   2. the cap as a NUMBER        "80-150 words, community-toned" in
//                                 prose produced a 224-word post
//   3. the model call             through lib/ai/claude.ts, never the
//                                 SDK
//   4. internal-key strip         "Concrete_details_used" reached a
//                                 live caption; an allowlist by shape
//   5. anti-generic               + one retry when revise
//   6. customer-first + tighten   P1. The tighten is PURE CODE, so it
//                                 runs even unattended
//   7. claims + provenance        guardOrMark, which is also where the
//                                 comparative, performance and benefit
//                                 rules live
//   8. the note contract          one note per channel, below
//
// THE NOTE CONTRACT. The plan said "one note". In the code there are
// two keys, because the owner's screens read two keys and renaming them
// would silently stop the owner seeing any of this:
//
//   _claimsNote  what the claims layer DID - composed in
//                guardGenerated, already in priority order
//   _storyNote   the shape or genericness verdict, ONE winner:
//                  1. a claims strip changed the copy -> stay silent
//                     here, _claimsNote is already saying more
//                  2. shape: too long, or mostly about the owner
//                  3. tightened: say what was cut
//                  4. generic: say what is missing
//
// Saying two shape notes at once reads as noise and the owner stops
// reading, which is the failure mode that matters.

import { getModel } from "@/lib/models";
import { callClaude, aiFailureMessage, aiFailureNote, type AiFailureNote } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";
import { guardOrMark, truthBlock } from "@/lib/claims/factsGate";
import { type ClaimsMode } from "@/lib/claims/claimCheck";
import { type BusinessFacts, type FactsAudience } from "@/lib/claims/businessFacts";
import { type NarrativeFinding } from "@/lib/claims/narrativeProvenance";
import { isContentKey } from "@/lib/content/contentKeys";
import { isGeneric, genericNote } from "@/lib/content/antiGeneric";
import {
  customerFirstProblem,
  customerFirstNote,
  customerFirstBrief,
  tightenOutput,
  askedForStory,
  WORD_CAPS,
} from "@/lib/content/customerFirst";
import { languageRule, normaliseLanguage, type CopyLanguage } from "@/lib/content/language";
import { resolveFestiveTopic } from "@/lib/expertise/seasonalCalendar";

export type LogContext = { supabase: any; dealershipId: string };

/**
 * What a surface tells the door about the piece it wants.
 *
 * `instructions` and `channelRules` are the surface's own: the door
 * does not know what an email subject line should do. Everything else
 * is the door's business.
 */
export type CopyBrief = {
  /** Human label for the retries and the notes: "welcome email", "Facebook post". */
  label: string;
  /** The format's requirements, in the surface's own words. */
  instructions: string;
  /** Channel rules (EMAIL_RULES, platform limits) appended verbatim. */
  channelRules?: string;
  /** Brand tone and language lines the surface already builds. */
  brandContext?: string;
  /** Research or page context the surface gathered. */
  grounding?: string;
  /** What the JSON should look like, when the surface needs a fixed shape. */
  shapeHint?: string;
};

export type CopyRequest = {
  /** The cap table's key when this surface has a cap: "facebook_post". Absent means no cap, which is NOT a cap of zero. */
  contentTypeKey?: string;
  /** What the owner typed, verbatim. The only honest signal for askedForStory. */
  topic: string;
  businessName: string;
  businessCategory: string;
  /** The records. null is a STATE, not an absence - see factsGate. */
  facts: BusinessFacts | null | undefined;
  mode: ClaimsMode;
  brief: CopyBrief;
  /** false on every unattended path: no retries, single shot. */
  revise: boolean;
  /**
   * May the owner's story be the subject?
   *
   * DEFAULTS TO FALSE AND IS A SEPARATE FIELD on purpose. The owner's
   * story is not an input to ordinary copy - that confusion is exactly
   * what produced the 224-word founder post. A surface may not pass
   * `true` on its own judgement; the door derives it from what the
   * owner typed unless the surface explicitly overrides.
   */
  storyAllowed?: boolean;
  language?: string | null;
  audience?: FactsAudience;
  operation: string;
  logContext?: LogContext;
  maxTokens?: number;
};

export type CopyResult = {
  /** The checked, shaped output. Carries _claimsNote / _storyNote for the owner's screens. */
  output: any;
  /** Claims the guard REMOVED. */
  removed: string[];
  /** Unbacked but kept in a draft: the owner can make these true by recording them. */
  substantiation: string[];
  priceWarnings: string[];
  narrative: NarrativeFinding[];
  /** How many sentences tightening cut, if any. */
  droppedSentences: number;
  /** True when the piece read like anyone's. */
  generic: boolean;
  /**
   * Safe to put in front of a customer with nobody reading it first.
   *
   * THE UNATTENDED PATHS READ THIS INSTEAD OF DECIDING FOR THEMSELVES.
   * contentAutopilot used to infer it from whether `_storyNote` was
   * set, which quietly turned every shape note into a reason to skip a
   * run - including "this post is a bit long", which tightening can
   * fix.
   */
  publishable: boolean;
  /** Why it is not publishable, in words the owner can act on. */
  blockedReason: string | null;
  _fallback?: boolean;
  _aiFailure?: AiFailureNote;
  _cause?: string;
  _detail?: string;
  _malformed?: boolean;
};

/** The cap, stated as a number the model can obey. */
function capLine(contentTypeKey?: string): string {
  const cap = contentTypeKey ? WORD_CAPS[contentTypeKey] : undefined;
  if (!cap) return "";
  return `\n- LENGTH: at most ${cap} words. Not ${cap + 1}.`;
}

/**
 * The structural instruction P1 asks for, in every prompt.
 *
 * Said here rather than in each surface's brief, because the one time
 * it lived in a brief it also said "the owner's own story is in the
 * facts above: use it - that detail is the whole point of the piece",
 * and the model did as it was told.
 */
function shapeLines(storyAllowed: boolean): string {
  if (storyAllowed) {
    return `\n- The owner asked for their own story, so the story IS the subject. Use only what is recorded above; invent no detail of it.`;
  }
  return [
    `\n- WHO THIS IS FOR: the reader, not the business. Order: the customer's situation, then what the product does about it, then the price or offer if it needs one, then one clear next step.`,
    `- The owner's own story is information, not the subject. AT MOST ONE short sentence of it, and only if it earns its place as proof.`,
  ].join("\n");
}

/** Everything the model is told, assembled in one place. */
export function copyPrompt(req: CopyRequest, storyAllowed: boolean): string {
  const language = normaliseLanguage(req.language ?? req.facts?.brand?.language ?? null);
  const topic = resolveFestiveTopic(req.topic, req.facts?.season) || "general, use good judgement for this business type";
  return `You are writing for an Indian ${req.businessCategory} business called "${req.businessName}".
${req.brief.brandContext ?? ""}${req.brief.grounding ?? ""}${truthBlock(req.facts, req.audience ?? "owner")}
${req.brief.channelRules ?? ""}

Topic/context: "${topic}"

Task: ${req.brief.label}
Requirements: ${req.brief.instructions}

HOW THIS MUST BE SHAPED:${shapeLines(storyAllowed)}${capLine(req.contentTypeKey)}
- ${languageRule(language)}

${req.brief.shapeHint ?? "Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly."}
Write real, specific copy. Never generic filler like "check out our amazing products".`;
}

/** Strip every key the model invented for its own bookkeeping. */
export function onlyContentKeys(output: any): any {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(output)) {
    // "_" keys are Hawlai's own machinery and are added AFTER this
    // point, so anything "_" prefixed here came from the model.
    if (isContentKey(k) || k === "hashtags" || k === "note") kept[k] = v;
  }
  return kept;
}

/**
 * The door.
 *
 * Every customer-facing piece of copy in this codebase goes through
 * here. tests/oneDoorForCopy.test.ts fails when a new generator writes
 * copy without it.
 */
export async function generateCopy(req: CopyRequest): Promise<CopyResult> {
  const language = normaliseLanguage(req.language ?? req.facts?.brand?.language ?? null);
  // The owner's words decide, not the surface's judgement.
  const storyAllowed = req.storyAllowed ?? askedForStory(req.topic);

  const fail = (extra: Partial<CopyResult>): CopyResult => ({
    output: { text: aiFailureMessage("bad_request") },
    removed: [],
    substantiation: [],
    priceWarnings: [],
    narrative: [],
    droppedSentences: 0,
    generic: false,
    publishable: false,
    blockedReason: "Copy generation did not produce anything usable — nothing was published.",
    _fallback: true,
    ...extra,
  });

  let r;
  try {
    r = await callClaude(
      {
        model: getModel("standard"),
        max_tokens: req.maxTokens ?? 2000,
        messages: [{ role: "user", content: copyPrompt(req, storyAllowed) }],
      },
      { operation: req.operation, logContext: req.logContext }
    );
  } catch (err: any) {
    console.error(`[generateCopy] ${req.operation} threw:`, err?.message);
    return fail({});
  }
  if (!r.ok) {
    return fail({
      output: { text: aiFailureMessage(r.failure.kind) },
      _aiFailure: aiFailureNote(r.failure),
      blockedReason: `${aiFailureMessage(r.failure.kind)} — nothing was published.`,
    });
  }

  const parsedReply = parseModelJson(r.text);
  if (!parsedReply.ok) {
    console.error(`[generateCopy] ${req.operation} ${parsedReply.cause}: ${parsedReply.detail}`);
    return fail({ _cause: parsedReply.cause, _detail: parsedReply.detail, _malformed: true });
  }

  // 4. The keys the model invented never travel further than this.
  let parsed: any = onlyContentKeys(parsedReply.value);

  // 5. ANTI-GENERIC. The verdict is pure code so it runs everywhere; the
  // repair is a model call and is gated behind `revise`, which is the
  // written contract the unattended path depends on.
  let generic = false;
  const verdict = isGeneric(parsed, req.facts ?? null, language);
  if (verdict.generic) {
    const retried = req.revise ? await retryForSpecificity(req, parsed, verdict, language) : null;
    if (retried && !isGeneric(retried, req.facts ?? null, language).generic) parsed = retried;
    else {
      if (retried) parsed = retried;
      generic = true;
    }
  }

  // 6. IS THIS PIECE ABOUT THE READER, and is it the right length?
  let shapeProblem = customerFirstProblem(parsed, req.contentTypeKey ?? "", req.topic);
  if (shapeProblem && req.revise) {
    const reshaped = await retryForShape(req, parsed, shapeProblem, language);
    if (reshaped) {
      parsed = onlyContentKeys(reshaped);
      // Re-measured, never assumed: a retry that is still wrong must
      // still be reported.
      shapeProblem = customerFirstProblem(parsed, req.contentTypeKey ?? "", req.topic);
    }
  }
  // TIGHTENING IS PURE CODE, SO IT RUNS EVEN UNATTENDED.
  //
  // It used to sit inside the `revise` branch with the model retry,
  // which meant the unattended path could only SKIP a long post, never
  // shorten one. "A bit long" is not a reason to post nothing when the
  // fix needs no model call at all.
  let droppedSentences = 0;
  if (shapeProblem?.kind === "too_long") {
    const tightened = tightenOutput(parsed, req.contentTypeKey ?? "");
    if (tightened.dropped) {
      parsed = tightened.output;
      droppedSentences = tightened.dropped;
      shapeProblem = customerFirstProblem(parsed, req.contentTypeKey ?? "", req.topic);
    }
  }

  // 7. CLAIMS AND PROVENANCE. guardOrMark runs the full guard when the
  // records are readable and the fact-independent subset when they are
  // not, and marks which happened either way.
  const guarded = guardOrMark(parsed, req.facts ?? null, req.mode);
  const output: any = guarded.output;

  // 8. THE NOTE CONTRACT. One shape note, in priority order.
  if (shapeProblem) output._storyNote = customerFirstNote(shapeProblem, droppedSentences);
  else if (droppedSentences)
    output._storyNote = `That came out longer than this should be, so I cut ${
      droppedSentences === 1 ? "a sentence" : `${droppedSentences} sentences`
    } from the middle and kept the opening, the close and anything with the price or the link in it. Ask me to put anything back.`;
  else if (generic) output._storyNote = genericNote(verdict);

  // A piece that reads like anyone's, or is the wrong shape for its
  // reader, is not something to publish while nobody is watching.
  const blockedReason = generic
    ? genericNote(verdict)
    : shapeProblem
      ? customerFirstNote(shapeProblem, droppedSentences)
      : null;

  return {
    output,
    removed: guarded.removed,
    substantiation: guarded.substantiation,
    priceWarnings: guarded.priceWarnings,
    narrative: guarded.narrative,
    droppedSentences,
    generic,
    publishable: !blockedReason,
    blockedReason,
  };
}

/**
 * The retry for a piece any business in this line of work could have
 * published. An EDIT at the same length, not a fresh generation: a
 * regeneration drifts off the topic the owner asked for.
 */
async function retryForSpecificity(
  req: CopyRequest,
  draft: any,
  verdict: ReturnType<typeof isGeneric>,
  language: CopyLanguage
): Promise<any | null> {
  const missing = (verdict as any).missing ?? null;
  const opener = (verdict as any).opener ?? null;
  return editDraft(
    req,
    draft,
    [
      `This draft ${req.brief.label} could have been published by any business in this trade. Fix that without inventing anything.`,
      opener ? `- The opening "${opener}" is worn out. Start somewhere else.` : "",
      missing ? `- It carries nothing only this business could say. Use this, which is on record: ${missing}` : "",
      `- Add no claim, number, offer or testimonial that is not already in the draft or in the facts.`,
    ]
      .filter(Boolean)
      .join("\n"),
    "copy_specificity_retry",
    language
  );
}

/** The retry for a piece written about the business instead of the reader. */
async function retryForShape(
  req: CopyRequest,
  draft: any,
  problem: NonNullable<ReturnType<typeof customerFirstProblem>>,
  language: CopyLanguage
): Promise<any | null> {
  return editDraft(
    req,
    draft,
    `This draft ${req.brief.label} is the wrong shape for its reader. Fix the shape without inventing anything.\n\n${customerFirstBrief(problem)}`,
    "copy_shape_retry",
    language
  );
}

/** One edit-in-place retry, shared by both repairs. */
async function editDraft(
  req: CopyRequest,
  draft: any,
  whatIsWrong: string,
  operation: string,
  language: CopyLanguage
): Promise<any | null> {
  try {
    const r = await callClaude(
      {
        model: getModel("standard"),
        max_tokens: req.maxTokens ?? 2000,
        messages: [
          {
            role: "user",
            content: `${whatIsWrong}

Rewrite the draft:
- Keep the same JSON shape and the same keys.
- ${languageRule(language)}
- Never add a claim, a number, an offer or a testimonial that is not already in the draft.
- Keep the format's requirements: ${req.brief.instructions}

Draft JSON:
${JSON.stringify(draft).slice(0, 6000)}

Return the edited JSON only — same shape, no markdown, no commentary.`,
          },
        ],
      },
      { operation, logContext: req.logContext }
    );
    if (!r.ok) return null;
    const parsedReply = parseModelJson(r.text);
    if (!parsedReply.ok) {
      console.error(`[generateCopy] ${operation} ${parsedReply.cause}: ${parsedReply.detail}`);
      return null;
    }
    const retried = parsedReply.value;
    // SHAPE CHECK. A retry that drops a key the surface needs is worse
    // than the draft it replaces: the card renders a missing field as
    // nothing at all.
    const sameShape = Object.keys(draft ?? {}).every((k) => k.startsWith("_") || k in (retried as any));
    return sameShape ? retried : null;
  } catch (err: any) {
    console.error(`[generateCopy] ${operation} threw:`, err?.message);
    return null;
  }
}
