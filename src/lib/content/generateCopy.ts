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

import { getModel, CLAUDE_MODELS } from "@/lib/models";
import { callClaude, aiFailureMessage, aiFailureNote, type AiFailureNote } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";
import { guardOrMark, truthBlock } from "@/lib/claims/factsGate";
import { contextFromFacts, type TaskKind } from "@/lib/facts/getContext";
import type { FactRecord } from "@/lib/facts/factRecord";
import { selectClaims, type SelectedClaim, type Selection } from "@/lib/facts/selectClaims";
import { validateSelection, validationNote, type Validated } from "@/lib/facts/validateSelection";
import { extractClaims, extractUnlicensable } from "@/lib/facts/extractClaims";
import { verifyClaims, verifyNote } from "@/lib/facts/verifyClaims";
import { copySentences, withoutSentences } from "@/lib/content/copySentences";
import { introducedWords, introducedNote } from "@/lib/content/introducedWords";
import { notCopySentences, notCopyNote } from "@/lib/content/notCopy";
import { type ClaimsMode } from "@/lib/claims/claimCheck";
import { type BusinessFacts, type FactsAudience, formatFactsForCopy, COPY_TRUTH_RULES } from "@/lib/claims/businessFacts";
import { type NarrativeFinding } from "@/lib/claims/narrativeProvenance";
import { isContentKey } from "@/lib/content/contentKeys";
import { isGeneric, genericNote, retryBrief } from "@/lib/content/antiGeneric";
import {
  customerFirstProblem,
  customerFirstNote,
  customerFirstBrief,
  tightenOutput,
  askedForStory,
  WORD_CAPS,
} from "@/lib/content/customerFirst";
import { languageFor, languageRule, normaliseLanguage, type CopyLanguage } from "@/lib/content/language";
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
  /**
   * What the label line is called: "Task" by default, "Content type" on
   * the content path.
   *
   * Not decoration. tests/preferredLanguage.test.ts asserts the
   * owner's language instruction appears ABOVE "Content type: Instagram
   * Post", which is how it checks the setting is an instruction rather
   * than something buried in the facts.
   */
  labelPrefix?: string;
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
  /**
   * The last few pieces written for this business, so this one does not
   * repeat them.
   *
   * A first-class field rather than something each surface writes into
   * its own brief: repetition is not a content-marketing problem, it is
   * every surface's problem, and the one surface that handled it was
   * the only one that could.
   */
  recent?: string[];
  /**
   * Run the ruthless copy-edit against the records before the verdict.
   *
   * An extra model call, so it is opt-in and gated behind `revise` as
   * well. It asks of every line: could a competitor publish this exact
   * line about themselves? If yes it is filler. Today only the content
   * path pays for it, which is how it arrived; it should become the
   * default once the cost is measured.
   */
  specificityPass?: boolean;
  language?: string | null;
  audience?: FactsAudience;
  operation: string;
  logContext?: LogContext;
  maxTokens?: number;
  /**
   * The model, when the surface routes its own.
   *
   * WhatsApp sends short messages through the AI Task Router
   * (modelForTask), which picks Haiku for every WHATSAPP_TASKS key.
   * Hardcoding "standard" in the door would have quietly tripled the
   * cost of every broadcast.
   */
  model?: string;
  /**
   * Run the FACT-BOUND pipeline instead of one prompt-and-guard pass.
   *
   * Two conditions, both required: the surface opts in here, and
   * FACT_BOUND_COPY=1 is set. Email only, by the founder's decision of
   * 2026-10-15 — S1 of docs/PLAN-CORE-ARCHITECTURE.md. A surface with no
   * graded baseline does not get this because a flag is on somewhere.
   */
  factBound?: boolean;
  /**
   * Which surface this is, for the context's slice.
   *
   * THE DOOR HARDCODED "email" until 2026-10-19, which was harmless
   * while email was the only surface on the pipeline and wrong the
   * moment a second one arrived: getContext slices by task, so WhatsApp
   * would have been given an email's slice and nothing would have said
   * so.
   */
  task?: TaskKind;
};

/** What has gone out lately, so this piece does not repeat it. */
function recentBlock(recent?: string[]): string {
  const lines = (recent ?? []).map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 5);
  if (!lines.length) return "";
  return [
    `\n\nALREADY PUBLISHED RECENTLY — do not repeat these openings, angles or phrasings:`,
    ...lines.map((s) => `- ${s.slice(0, 200)}`),
  ].join("\n");
}

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
  /** True when the ruthless copy-edit ran and its answer was used. */
  revised?: boolean;
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
  /**
   * NOTHING WAS WRITTEN: the model could not be reached at all.
   *
   * Distinct from a draft that came out badly. An eval reported five of
   * nine cases as fine, with a cheap total, while their select call had
   * been refused by the provider — the pipeline failed closed as
   * designed and threw nothing, so the run read as complete.
   */
  incomplete?: boolean;
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
    // "did NOT ask for their story" is asserted by
    // tests/customerFirstPost.test.ts. It is the sentence that replaced
    // "that detail is the whole point of the piece", and dropping it
    // while moving this code would have quietly undone the inversion.
    `- The owner did NOT ask for their story. The owner's own story is information, not the subject. AT MOST ONE short sentence of it, and only if it earns its place as proof.`,
  ].join("\n");
}

/** Everything the model is told, assembled in one place. */
export function copyPrompt(req: CopyRequest, storyAllowed: boolean): string {
  const language = languageFor(req.topic, req.language ?? req.facts?.brand?.language ?? null);
  const topic = resolveFestiveTopic(req.topic, req.facts?.season) || "general, use good judgement for this business type";
  return `You are writing for an Indian ${req.businessCategory} business called "${req.businessName}".
${req.brief.brandContext ?? ""}${req.brief.grounding ?? ""}${truthBlock(req.facts, req.audience ?? "owner")}
${req.brief.channelRules ?? ""}

Topic/context: "${topic}"

${req.brief.labelPrefix ?? "Task"}: ${req.brief.label}
Requirements: ${req.brief.instructions}

HOW THIS MUST BE SHAPED:${shapeLines(storyAllowed)}${capLine(req.contentTypeKey)}${recentBlock(req.recent)}
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
/**
 * Is this piece going through the fact-bound pipeline?
 *
 * BOTH CONDITIONS, deliberately. An env var alone would switch it on
 * for fifteen surfaces at once, and exactly one of them has a
 * human-graded baseline to be compared against.
 */
export function factBoundEnabled(req: CopyRequest): boolean {
  // NO `Boolean(req.facts)` HERE, AND ITS ABSENCE IS THE POINT.
  //
  // It used to be the third condition, and it sent the
  // records-unreadable case down the OLD path — so candle-08, the eval
  // case built to catch invented specifics, never entered the pipeline.
  // It produced a 20-minute figure twice, a two-hour first-burn
  // instruction, hand-pouring and a scent description: six of the
  // thirteen unsupported claims the reviewer found on 16 October 2026.
  //
  // Backwards. A business whose records cannot be read is precisely when
  // this pipeline matters most: with nothing to cite, the Write step
  // gets zero approved claims and the instruction not to fill the gap.
  return process.env.FACT_BOUND_COPY === "1" && req.factBound === true;
}

/**
 * The WRITE prompt: the approved claims, and nothing else factual.
 *
 * IT DOES NOT CARRY THE RECORDS. The writer is not choosing any more —
 * that happened in step 1 and was checked in code in step 2 — so showing
 * it the whole fact set again would reopen the exact door this pipeline
 * closes. What it may state is a numbered list, and the rules say so in
 * those words.
 */
export function factBoundPrompt(req: CopyRequest, approved: SelectedClaim[], unknowns: string[]): string {
  const figure = (c: SelectedClaim) =>
    c.value === null || c.value === undefined || c.value === "" ? "" : ` — state the figure exactly as: ${c.value}${c.unit && c.unit !== "inr" ? ` ${c.unit}` : ""}`;
  const claims = approved.length
    ? approved.map((c, i) => `[${i + 1}] ${c.intent || c.claimType}${figure(c)}`).join("\n")
    : "(none)";
  const language = languageFor(req.topic, req.language ?? req.facts?.brand?.language ?? null);
  // THE ADDRESSES, WHICH ARE FURNITURE AND NOT CLAIMS.
  //
  // candle-09's WhatsApp message on 2026-10-20 ended "Check them out
  // [link]". That placeholder is nobody's merge field - nothing in this
  // codebase fills one in, and the convention everywhere else is the
  // real address: businessFacts tells the old path "the ONLY website
  // address you may use", and claimCheck refuses any other host. So the
  // writer invented a hole because THIS prompt carried no link at all.
  //
  // notCopy now strips the placeholder, which is the right outcome and
  // the wrong fix on its own: the message would simply lose its call to
  // action. A link is not a claim about the business, it is how the
  // reader acts, so it belongs here in the same category as WhatsApp's
  // opt-out line.
  const store = req.facts?.links?.store ?? null;
  const bookings = (req.facts?.products ?? [])
    .map((p) => (p.bookingUrl ? `${p.name} - ${p.bookingUrl}` : null))
    .filter(Boolean) as string[];
  const addresses = [
    store ? `\n\nTHE ONLY WEB ADDRESS YOU MAY USE: ${store}. Write it exactly as given, or leave it out - never a placeholder, never any other address.` : "",
    bookings.length ? `\nThe only booking addresses: ${bookings.join("; ")}.` : "",
    store || bookings.length ? "" : "\n\nTHERE IS NO WEB ADDRESS ON RECORD. Do not include a link of any kind, and do not leave a space for one.",
  ].join("");
  const parts = [
    req.brief.brandContext ?? "",
    `\nYou are writing a ${req.brief.label}.`,
    req.brief.instructions ? `\n${req.brief.instructions}` : "",
    req.brief.channelRules ? `\n${req.brief.channelRules}` : "",
    recentBlock(req.recent),
    `\n\nTHE ONLY FACTS YOU MAY STATE — every factual sentence must be one of these:\n${claims}`,
    addresses,
    // A PIECE WITH NOTHING APPROVED IS A SHORT PIECE, NOT AN INVENTED
    // ONE. The founder's rule of 2026-10-15: when the records are thin
    // the copy gets shorter and the owner gets a question. candle-08 and
    // salon-09 in the baseline are what happens otherwise — a 40-minute
    // dryer and an order that does not exist.
    approved.length
      ? ""
      : `\n\nNO FACT WAS APPROVED FOR THIS PIECE. Write only a greeting, one line about what the reader may be looking for, and one invitation to ask. State nothing about the product, the price, the materials, the process or the business. Do not fill the gap.`,
    `\n\nRULES`,
    `\n- State nothing factual that is not in the list above: not a number, not a material, not a process, not a comparison, not a benefit, not a promise about anything happening automatically.`,
    // THE FIELDS GO TO THE CUSTOMER. On 2026-10-20 the writer put
    // "FSSAI: [LICENSE NUMBER NEEDED]" and its own four questions into
    // dairy-05's WhatsApp message. notCopy.ts strips both in code; this
    // is the half that stops them being written. Both, because a rule
    // in a prompt is applied unevenly by definition.
    `\n- Everything you write in these fields is sent to the customer as it stands. Never leave a blank, a bracket or a placeholder for someone to fill in later, and never write a note, a question or a list of what you still need — if a fact is missing, leave the sentence out altogether and say nothing about it.`,
    `\n- Greetings, feelings, questions and one call to action are yours to write freely. Those are not facts.`,
    // THE TWO SHAPES THAT GOT THROUGH ON 16 OCTOBER 2026, named because
    // the model plainly does not read them as factual claims. Insurance
    // rather than the fix: the verifier is what has to hold, since a
    // later prompt change would re-open anything only said here.
    `\n- DO NOT ADD A JUDGEMENT TO A FACT. Having stated something from the list, stop. No "— and that's the difference", no "because we take no shortcuts", no "results are real", no "you can taste it". A flourish attached to a true fact is a claim of its own, and nothing above supports it.`,
    `\n- DO NOT STRENGTHEN A FACT WITH A WORD. Not pure, genuine, authentic, finest, premium, real, proper, perfect, 100%, asli or shudh — unless that exact word is in the list above. The list says what the thing IS; adding one of these says something more.`,
    // THE PATTERN THE FOUNDER NAMED ON 18 OCTOBER, and the one the other
    // two rules do NOT cover: both halves are on the list, so a model
    // joining them believes it is obeying. The LINK is the new claim,
    // and nobody made it.
    `\n- DO NOT JOIN TWO FACTS INTO A THIRD. Each item on the list stands on its own. You may not say that one causes, explains, proves or results in another — no "so", "which is why", "that is how", "isliye", "kyunki", "iska matlab". Two true facts side by side do not make the link between them true, and the link is not on the list.`,
    // SCOPE, in the writer's own terms. A fact selected about one
    // product may not be spread across the range, and a store-wide
    // policy may be said of any product because it IS about all of them.
    `\n- A FACT ABOUT ONE NAMED PRODUCT STAYS WITH THAT PRODUCT. Do not say of the whole range what the list says of one item, and do not attach one item's number to another. A fact the list gives about the business generally MAY be said of what the business makes as a whole. Shipping and discount codes are store-wide and may be said of anything.`,
    `\n- Say nothing about the reader's own order, booking or account. You do not know who is reading this.`,
    `\n- Figures appear exactly as given above. Do not convert them, round them or spell them out in words.`,
    unknowns.length ? `\n- NOT on record, and must not appear in any form: ${unknowns.join("; ")}.` : "",
    `\n- ${languageRule(language)}`,
    capLine(req.contentTypeKey),
    `\n\n${req.brief.shapeHint ?? "Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly."}`,
  ];
  return parts.filter(Boolean).join("");
}

export async function generateCopy(req: CopyRequest): Promise<CopyResult> {
  const language = languageFor(req.topic, req.language ?? req.facts?.brand?.language ?? null);
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

  // ------------------------------------------------------------------
  // THE FACT-BOUND PIPELINE — steps 1 and 2, before a word is written.
  //
  // docs/PLAN-CORE-ARCHITECTURE.md §2.1. Select chooses which records
  // the piece will state; Validate checks every citation, licence and
  // figure in code. The writer then sees only what survived.
  //
  // IT FAILS CLOSED. If Select cannot be reached, this returns the
  // ordinary AI-failure result rather than falling back to the old
  // prompt — a silent fallback would mean the flag was on, the pipeline
  // was off, and nothing said so.
  // ------------------------------------------------------------------
  const factBound = factBoundEnabled(req);
  let factRecords: FactRecord[] = [];
  let validated: Validated | null = null;
  let selection: Selection | null = null;
  if (factBound) {
    const ctx = contextFromFacts(req.logContext?.dealershipId ?? "unknown", req.facts, { kind: req.task ?? "other", topic: req.topic });
    factRecords = ctx.records;
    // NOTHING TO SELECT FROM IS NOT A FAILURE TO SELECT.
    //
    // With no records there is nothing for a model to choose between, so
    // Select is skipped — no call, no cost — and the Write step runs
    // with zero approved claims and the instruction not to fill the gap.
    // That is the founder's rule for thin records: the piece gets
    // shorter and the owner gets a question.
    //
    // Distinguishing this from an unreachable model matters: one writes
    // a short, honest email, the other must write nothing at all.
    if (!ctx.records.length) {
      selection = { claims: [], conflicts: [], unknowns: ctx.unknowns };
      validated = { approved: [], rejected: [], questions: [] };
    } else {
    const selected = await selectClaims(ctx, { logContext: req.logContext ?? null });
    if (!selected.ok) {
      console.error(`[generateCopy] ${req.operation} selection failed: ${selected.reason}`);
      // THE REAL KIND, NOT A GUESS. This said aiFailureMessage("overloaded")
      // until 2026-10-20, when the API credit balance ran out mid-run:
      // claude.ts classified it as `credits` and has the right words
      // for it, and this line overwrote them with "The AI service is
      // busy — try again in a minute".
      //
      // An owner told to try again in a minute does exactly that, and
      // keeps doing it, and it never works. A credits failure is not
      // busyness and is not the owner's to wait out.
      return fail({
        output: { text: aiFailureMessage(selected.kind ?? "overloaded") },
        _aiFailure: selected.kind ? aiFailureNote({ kind: selected.kind }) : undefined,
        blockedReason: `The facts for this business could not be checked just now (${selected.reason}) — nothing was written.`,
        incomplete: true,
      });
    }
      selection = selected.selection;
      validated = validateSelection(selection, ctx.records, ctx.dealershipId);
    }
  }

  let r;
  try {
    r = await callClaude(
      {
        model: req.model ?? getModel("standard"),
        max_tokens: req.maxTokens ?? 2000,
        messages: [
          {
            role: "user",
            content: validated ? factBoundPrompt(req, validated.approved, [...(selection?.unknowns ?? [])]) : copyPrompt(req, storyAllowed),
          },
        ],
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
      incomplete: true,
    });
  }

  const parsedReply = parseModelJson(r.text);
  if (!parsedReply.ok) {
    console.error(`[generateCopy] ${req.operation} ${parsedReply.cause}: ${parsedReply.detail}`);
    return fail({ _cause: parsedReply.cause, _detail: parsedReply.detail, _malformed: true });
  }

  // 4. The keys the model invented never travel further than this.
  let parsed: any = onlyContentKeys(parsedReply.value);

  // ------------------------------------------------------------------
  // THE FACT-BOUND PIPELINE — steps 4a and 4b, on the finished words.
  //
  // The writer's own citations are NOT consulted here. Step 4a re-reads
  // the copy with no records in front of it and lists what it actually
  // claims, so a model that was handed three approved facts and wrote a
  // fourth claim is caught. Citation is necessary and not sufficient.
  //
  // A sentence carrying an unsupported claim is removed. The ordinary
  // claim layer still runs afterwards as a second net, by the founder's
  // decision of 2026-10-11.
  // ------------------------------------------------------------------
  let factBoundNote: string | null = null;
  let factBoundDegraded = false;
  // THE CHECKS ARE A FUNCTION, BECAUSE THEY RUN TWICE.
  //
  // Approved by the founder on 2026-10-20, with the cost named: two
  // extra model calls on every revised draft. His reason is the right
  // one and worth keeping here - the specificity pass runs on EVERY
  // draft, so before this most pieces were leaving through the gap
  // without a full check.
  //
  // The ordering fault: notCopy, introducedWords, the extractor and
  // the verifier all ran at step 4, and three later steps replace the
  // copy with new model output - the specificity pass, the
  // anti-generic retry and the shape retry. Everything they wrote had
  // never been seen by any of them. dairy-10 shipped "Order now ->
  // [link]" through a check that catches that string in isolation.
  //
  // ONE IMPLEMENTATION, CALLED TWICE, rather than a second copy of a
  // hundred and eighty lines that would drift from the first within a
  // week.
  const runFactChecks = async (): Promise<void> => {
    if (!factBound || !validated) return;
    const sentences = copySentences(parsed);

    // ------------------------------------------------------------------
    // WORDS THE WRITER BROUGHT THAT NOBODY GAVE IT — in code, before any
    // model is asked anything.
    //
    // Founder's direction of 19 October: "pure" had been fixed three
    // times, after "asli" and "premium", and each fix added a word to a
    // list inside a PROMPT. The same rule caught "pure desi ghee" in one
    // run and let it through in the next, because a prompt rule is
    // applied unevenly by definition.
    //
    // So this runs FIRST and always: an intensifier or a proper noun
    // that appears in nothing the writer was given is an assertion
    // nobody made. It catches the fourth boosting adjective and the next
    // invented city without anybody adding a word.
    // ------------------------------------------------------------------
    // THE VOCABULARY COMES FROM RECORDS, NEVER FROM MODEL-WRITTEN TEXT.
    //
    // It used to include each approved claim's `intent` — the SELECT
    // model's own prose — and "Pure desi ghee, made in Indore" survived
    // run 9 because of it: Select wrote "pure" into an intent, which put
    // the word in the allowed set, which let the writer say it. A check
    // measured against text a model wrote is not a check; it is the
    // model marking its own work.
    //
    // `value`, `unit` and `aboutProduct` stay, because each was matched
    // against a record in step 2 before it got here.
    const allowedVocabulary = [
      // A FIGURE AND A PRODUCT NAME ONLY, never prose the Select model
      // wrote. `value` is documented as "the figure, copied exactly
      // from the cited record", and when Select puts a phrase there
      // instead (the run of 2026-10-19 put "Soy wax" and "FSSAI licence
      // 11223344556677" in it) that phrase would authorise its own
      // words — the same fault as including c.intent, which was removed
      // for exactly this reason: a check measured against text a model
      // wrote is the model marking its own work.
      //
      // Nothing legitimate is lost. Every record's own words are in the
      // vocabulary on the next line, so a value genuinely copied from a
      // record is already there.
      ...validated.approved.map((c) => `${typeof c.value === "string" ? "" : c.value ?? ""} ${c.unit ?? ""} ${c.aboutProduct ?? ""}`),
      ...factRecords.map((r) => `${r.key.replace(/[._]/g, " ")} ${r.recordedText} ${r.value ?? ""}`),
      req.businessName,
      req.businessCategory,
      // What the owner typed. A place or a name they asked for is
      // theirs, not the model's.
      req.topic,
      req.brief.label,
      // The channel's own required furniture. WhatsApp's opt-out line is
      // appended AFTER the door (channelRules.addWhatsappOptOut), so it
      // never reaches these checks — but if a model writes it itself,
      // "Reply STOP to stop these messages" must not read as an
      // introduced name.
      req.brief.channelRules ?? "",
      // The addresses the writer was given above. A store host is not a
      // name the model introduced.
      req.facts?.links?.store ?? "",
      ...(req.facts?.products ?? []).map((p) => p.bookingUrl ?? ""),
    ];
    // NOT COPY AT ALL, checked first. A slot or a note about writing
    // the message is not a claim, so no claim check can see it — and
    // "[LICENSE NUMBER NEEDED]" reaching a customer is worse than an
    // unsupported sentence, which is at least addressed to the reader.
    const notCopy = notCopySentences(sentences.map((s) => s.analysed));
    let notCopyNoteText: string | null = null;
    if (notCopy.length) {
      notCopyNoteText = notCopyNote(notCopy, sentences.map((s) => s.text));
      parsed = withoutSentences(parsed, sentences, [...new Set(notCopy.map((f) => f.sentenceIndex))]);
    }

    const introduced = introducedWords(sentences.map((s) => s.analysed), allowedVocabulary);
    let introducedNoteText: string | null = null;
    if (introduced.length) {
      introducedNoteText = introducedNote(introduced, sentences.map((s) => s.text));
      parsed = withoutSentences(parsed, sentences, [...new Set(introduced.map((f) => f.sentenceIndex))]);
    }

    // TWO PASSES, AND THE SECOND ASKS ONE SHORT QUESTION.
    //
    // salon-04's "Rs 3500 mein apke baal ... ho jayenge" was published
    // by runs 6, 7, 8 and 10. The rule that should catch it is right -
    // sent on its own the extractor reports it as `benefit` and the
    // verifier refuses it outright - but in a real five-sentence
    // message among a price, a location and a call to action, the same
    // call at temperature 0 does not mention it. A recall failure on a
    // long instruction, which no retry can fix because the answer is
    // deterministic.
    //
    // extractUnlicensable asks about four classes and nothing else, in
    // thirty lines instead of two hundred. Measured on the exact
    // batches those four runs shipped: 2 of 2 found, and nothing at all
    // on six controls including "The paneer is fresh.", "We're doing
    // haircuts at 400" and "Ask us anything!".
    //
    // THE FOUR ARE THE ONES WHERE A MISS IS UNRECOVERABLE. A missed
    // price is caught by arithmetic against the record, a missed
    // material goes to the judge - but nothing can ever license a
    // benefit, so a missed one is simply published.
    const [firstPass, secondNet] = await Promise.all([
      extractClaims(sentences.map((s) => s.analysed), { logContext: req.logContext ?? null }),
      extractUnlicensable(sentences.map((s) => s.analysed), { logContext: req.logContext ?? null }),
    ]);
    let extracted: typeof firstPass =
      firstPass.ok && secondNet.ok
        ? { ok: true, claims: [...firstPass.claims, ...secondNet.claims], costInr: firstPass.costInr + secondNet.costInr }
        : // THE NET FAILING DOES NOT DEGRADE A PIECE THE MAIN PASS READ,
          // and the main pass failing is not rescued by the net: it
          // reads four classes out of fourteen, so on its own it would
          // mean "nothing else was checked".
          firstPass;
    // AND IF IT SAW NOTHING, ASK A BETTER MODEL ONCE BEFORE GIVING UP.
    //
    // The output gate of 2026-10-20 caught the extractor doing two
    // different things with the same case in the same hour: zero claims
    // in run 10, and two claims when re-asked minutes later. Haiku's
    // recall on a whole message is not stable, and this one call is the
    // single point of failure for the entire verify step - no claims
    // means no verdicts, which used to mean a clean-looking piece.
    //
    // Marking it unverified was the right fail-closed move and it is
    // still the fallback. But degrading a piece because a cheap model
    // blinked is a poor trade when one Sonnet call settles it: this
    // costs nothing on the overwhelming majority of pieces, because it
    // only fires when the first pass returned nothing at all from copy
    // written out of approved facts.
    if (extracted.ok && validated.approved.length > 0 && extracted.claims.length === 0) {
      const second = await extractClaims(sentences.map((s) => s.analysed), {
        logContext: req.logContext ?? null,
        model: CLAUDE_MODELS.standard,
      });
      if (second.ok && second.claims.length) extracted = second;
    }
    // AN EMPTY EXTRACTION IS NOT A CLEAN ONE, and the eighth S2a run of
    // 2026-10-20 is why this branch exists.
    //
    // salon-04's message said "Rs 3500 mein apke baal soft aur shiny ho
    // jayenge". That is a benefit claim, benefit is unlicensable, and
    // the verifier refuses it with no judge call - measured afterwards
    // on the EXACT five sentences the door sent, for 30 paise: the
    // extractor reports it and it is refused outright. In the run it
    // was not removed, because the extractor came back with no claims
    // at all. No claims means no verdicts, no verdicts means no
    // removals and no note, and the run printed a clean case.
    //
    // THIS IS F-01 IN A NEW PLACE. `facts ? guard() : skip` turned the
    // claims layer off on a transient read error; here an empty answer
    // from one model call turned the verifier off, and silence read as
    // approval. Everything in this pipeline must fail closed, including
    // its own measurements of itself.
    //
    // THE TEST IS THE SELECTION, not a guess about the prose. Select
    // approved facts and the writer was told to state them, so a piece
    // whose copy yields NO claim either states nothing factual - in
    // which case it is a generic piece, which the anti-generic verdict
    // handles - or was never examined. Marking it unverified is the
    // only safe reading, and it costs nothing when the copy really is
    // factless because there is then nothing to publish anyway.
    const examinedNothing = extracted.ok && validated.approved.length > 0 && extracted.claims.length === 0;
    if (!extracted.ok || examinedNothing) {
      // UNVERIFIED IS NOT VERIFIED. The copy stands, and it is marked
      // and made unpublishable rather than quietly treated as checked.
      factBoundDegraded = true;
      factBoundNote = extracted.ok
        ? "This was written from your records, but the check that reads it back found nothing to check, so it is marked unverified rather than approved."
        : "This could not be checked against your records just now, so it is marked unverified.";
    } else {
      const verified = await verifyClaims(extracted.claims, validated.approved, { logContext: req.logContext ?? null, records: factRecords });
      factBoundDegraded = verified.degraded;
      if (verified.unsupportedSentences.length) {
        parsed = withoutSentences(parsed, sentences, verified.unsupportedSentences);
      }
      factBoundNote = verifyNote(verified);
    }
    // The word check's findings ride alongside the verifier's, not
    // instead of them: they are different reasons for removing a
    // sentence and the owner should see both.
    factBoundNote = [notCopyNoteText, introducedNoteText, factBoundNote].filter(Boolean).join("\n") || null;
  };
  await runFactChecks();
  // WHAT THE FIRST PASS ACTUALLY SAW, so step 6b can tell whether the
  // retries changed it.
  const verifiedShape = JSON.stringify(parsed);
  if (factBound && validated) {
    const selectionNote = validationNote(validated, selection?.conflicts ?? [], selection?.unknowns ?? []);
    factBoundNote = [selectionNote, factBoundNote].filter(Boolean).join("\n") || null;
  }

  // 4b. THE RUTHLESS EDIT, when the surface asked for it.
  //
  // Not the same thing as the anti-generic retry below. This one runs
  // on EVERY draft, good or bad, and asks of each line whether a
  // competitor could publish it about themselves. The retry below only
  // runs when the verdict says the piece failed.
  let revised = false;
  if (req.specificityPass && req.revise && req.facts) {
    const edited = await editDraft(
      req,
      parsed,
      ruthlessEditBrief(req.brief.label, req.facts),
      "content_revision",
      language
    );
    if (edited) {
      parsed = onlyContentKeys(edited);
      revised = true;
    }
  }

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

  // 6b. AND NOW THE WHOLE CHECK AGAIN, BECAUSE THE COPY HAS CHANGED.
  //
  // Three steps above replace `parsed` with new model output: the
  // specificity pass, which runs on EVERY draft, the anti-generic
  // retry and the shape retry. Before 2026-10-20 nothing they wrote
  // was ever checked - not the placeholder guard, not the
  // introduced-word check, not the extractor, not the verifier. The
  // founder approved the full fix with its cost stated: two extra
  // model calls on a revised draft.
  //
  // ONLY WHEN THE COPY ACTUALLY CHANGED. An unrevised draft pays
  // nothing, and the comparison that decides is free. That matters
  // more than it looks: the specificity pass fires on every draft but
  // often returns nothing usable, and those pieces must not be billed
  // twice.
  //
  // THE SECOND PASS IS THE ONE THAT COUNTS. It sees the copy the
  // customer would actually receive, which is what this layer was
  // always supposed to be checking. The first pass is not wasted - it
  // removes unsupported sentences before the retries spend a call
  // polishing them.
  if (factBound && validated && JSON.stringify(parsed) !== verifiedShape) {
    // THE NOTE IS REBUILT, NOT STACKED. The first pass's removals
    // describe sentences that may no longer exist, and an owner
    // reading "Removed X" about a line they cannot see has been told
    // something false.
    factBoundNote = null;
    factBoundDegraded = false;
    await runFactChecks();
    const selectionNote = validationNote(validated, selection?.conflicts ?? [], selection?.unknowns ?? []);
    factBoundNote = [selectionNote, factBoundNote].filter(Boolean).join("\n") || null;
    // RE-MEASURED, NOT ASSUMED. A removal here can leave the piece
    // short or generic, and the owner should be told the truth about
    // what they are looking at now. Pure code, so it costs nothing.
    shapeProblem = customerFirstProblem(parsed, req.contentTypeKey ?? "", req.topic);
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

  // THE FACT-BOUND NOTE rides alongside the claims note rather than
  // replacing it. They answer different questions: _claimsNote says
  // what the old guard removed, this says what was never selected, what
  // conflicts with the records, and what the verifier took back out.
  if (factBoundNote) output._factsNote = factBoundNote;

  // A piece that reads like anyone's, or is the wrong shape for its
  // reader, is not something to publish while nobody is watching.
  //
  // AND NEITHER IS AN UNVERIFIED ONE. When the extractor or the judge
  // could not be reached, the copy is kept and marked — but it is not
  // publishable, because "nobody checked" must never travel as
  // "checked". That is F-01's lesson at the far end of the pipeline.
  // DEGRADATION COMES FIRST, ahead of genericness and shape, and the
  // order is a judgement rather than an accident. Those two are quality
  // verdicts — this piece reads like anyone's, this piece is the wrong
  // shape — and an owner can argue with them. "Nobody could check this
  // against your records" is a different kind of statement, and it is
  // the one that decides whether the words are safe to send. A test
  // caught this: the degraded branch was unreachable because a short
  // draft tripped the genericness verdict first.
  const blockedReason = factBoundDegraded
    ? "Part of this could not be checked against your records just now, so it is marked unverified and nothing was published."
    : generic
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
    revised,
    publishable: !blockedReason,
    blockedReason,
  };
}

/**
 * The ruthless copy-edit, word for word as the content path has asked
 * for it since 2026-10-09.
 *
 * Kept verbatim on purpose: it is a prompt that has been tuned against
 * real output, and rewording it to read better here would be changing
 * behaviour while claiming to move code.
 */
function ruthlessEditBrief(contentLabel: string, facts: BusinessFacts): string {
  return `You are a ruthless copy editor. Below is a draft ${contentLabel} for a real business, and the verified facts about that business.

THE TEST, line by line: could a competitor in the same line of work publish this exact line about themselves? If yes it is filler — cut it, or replace it with something only THIS business can say, taken from the facts.

Rules:
- Replace only with specifics that are IN the facts: a step, a material, a place, a length of time, something a customer said, the owner's own words. Never invent a detail, number, review, offer or claim — inventing one is worse than leaving the line out.
- Keep the same JSON shape and roughly the same length. No preamble.
- Cut stacked adjectives, rented enthusiasm and marketing throat-clearing. Plain and specific beats warm and vague.
- A line already specific to this business stays exactly as it is.

${formatFactsForCopy(facts)}

${COPY_TRUTH_RULES}`;
}

/**
 * THE CHECKS, WITHOUT THE GENERATION.
 *
 * Some surfaces do not generate prose with a single call that the door
 * can own. adEngine's model call is a structured extraction - headline,
 * body, budget, city and an image scene, with its own self-critique
 * retry loop - so the door cannot write it. What the door CAN own is
 * the order of the checks afterwards, which is the part that kept
 * drifting between surfaces.
 *
 * NO MODEL CALLS HERE. No retries, no tightening prompt - the caller
 * already has its draft. Everything else runs in the same order:
 * invented keys, the genericness verdict, the shape measure, then
 * claims and provenance.
 *
 * This is deliberately NOT a general escape hatch. A surface that calls
 * the model to write prose uses generateCopy; this is for one that
 * does not, and tests/oneDoorForCopy.test.ts counts its users.
 */
export function guardCopyFields<T extends object>(
  draft: T,
  opts: {
    facts: BusinessFacts | null | undefined;
    mode: ClaimsMode;
    topic?: string;
    contentTypeKey?: string;
    language?: string | null;
  }
): {
  output: any;
  removed: string[];
  substantiation: string[];
  priceWarnings: string[];
  narrative: NarrativeFinding[];
  generic: boolean;
  droppedSentences: number;
  publishable: boolean;
  blockedReason: string | null;
} {
  const language = normaliseLanguage(opts.language ?? opts.facts?.brand?.language ?? null);
  let parsed: any = onlyContentKeys(draft);

  const verdict = isGeneric(parsed, opts.facts ?? null, language);
  const generic = verdict.generic;

  let shapeProblem = customerFirstProblem(parsed, opts.contentTypeKey ?? "", opts.topic ?? "");
  let droppedSentences = 0;
  if (shapeProblem?.kind === "too_long") {
    const tightened = tightenOutput(parsed, opts.contentTypeKey ?? "");
    if (tightened.dropped) {
      parsed = tightened.output;
      droppedSentences = tightened.dropped;
      shapeProblem = customerFirstProblem(parsed, opts.contentTypeKey ?? "", opts.topic ?? "");
    }
  }

  // F-01: guardOrMark, never `facts ? guard() : skip`. A failed records
  // read is a state, not a way through.
  const guarded = guardOrMark(parsed, opts.facts ?? null, opts.mode);
  const output: any = guarded.output;

  if (shapeProblem) output._storyNote = customerFirstNote(shapeProblem, droppedSentences);
  else if (generic) output._storyNote = genericNote(verdict);

  const blockedReason = generic ? genericNote(verdict) : shapeProblem ? customerFirstNote(shapeProblem, droppedSentences) : null;
  return {
    output,
    removed: guarded.removed,
    substantiation: guarded.substantiation,
    priceWarnings: guarded.priceWarnings,
    narrative: guarded.narrative,
    generic,
    droppedSentences,
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
  // THE PROMPT IS THE CONTENT PATH'S, WORD FOR WORD.
  //
  // My first version of this was a readable paraphrase, and three
  // existing tests caught it: the retry must name the recorded specific
  // (retryBrief), must say "the same length" so a rewrite does not
  // become an expansion, and must say NOT to reach for the owner's
  // personal history - which is the 2026-10-09 inversion, stated in the
  // retry rather than only in the first prompt.
  //
  // Nothing to retry TOWARD is not a failure to report: it is a
  // business that has recorded nothing yet, and a second model call
  // would produce the same words.
  const brief = retryBrief(verdict as any, req.facts ?? null);
  if (!brief.trim()) return null;
  return editDraft(
    req,
    draft,
    `This draft ${req.brief.label} could have been published by any business in the same line of work. Fix that, without inventing anything.

${brief}`,
    "content_specificity_retry",
    language,
    [
      `- Keep the same JSON shape and the same length. This is a rewrite, not an expansion — if the detail needs room, cut a generic line to make it.`,
      `- Compress the detail into a phrase where the piece is short. A whole sentence about it is only for a piece that has room.`,
      `- Write about the customer and the product. Do NOT reach for the owner's personal history unless this piece is actually about it.`,
    ]
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
  language: CopyLanguage,
  /** Extra rule lines this particular repair needs, kept in its own caller. */
  extraRules: string[] = []
): Promise<any | null> {
  try {
    const r = await callClaude(
      {
        model: req.model ?? getModel("standard"),
        max_tokens: req.maxTokens ?? 2000,
        messages: [
          {
            role: "user",
            content: `${whatIsWrong}

Rewrite the draft:
- Keep the same JSON shape and the same keys.
- ${languageRule(language)}
${extraRules.join("\n")}
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
