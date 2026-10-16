// C2 STEP 4a — WHAT DOES THIS SENTENCE ACTUALLY CLAIM?
//
// docs/PLAN-CORE-ARCHITECTURE.md §2.2. This is the step that removes
// the language problem and the paraphrase problem, because matching
// stops happening on words: the text is READ and re-stated as English
// canonical claims, and the entailment step then matches those against
// records.
//
// WHY IT IS THE RISKIEST PART OF THE DESIGN. A claim this step does not
// enumerate is never judged, so a miss PASSES a false sentence
// silently. The denylist's failures were at least visible in the output;
// this one's would not be. So it is measured against the 135
// human-graded sentences of the 13 October baseline before anything
// depends on it, and the measurement is the gate — not an assumption.
//
// IT IS GIVEN NO RECORDS, DELIBERATELY. Two reasons. It cannot be
// talked into agreeing that a claim is supported, because it is never
// asked; and the writer's own citations are never evidence — step 4a
// re-derives the claims from the text alone, so a model that cites a
// fact id while writing something else is caught. Citation is necessary
// and not sufficient, which is the rule this codebase already runs on.
//
// NO NUMBER IS JUDGED HERE. A claim carrying a value goes to code,
// which checks it against the record. The judge only ever sees
// qualitative claims.

import { callClaude } from "@/lib/ai/claude";
import { CLAUDE_MODELS } from "@/lib/models";

/** What a claim is about. `competitor` is the one that needs no licence to refuse. */
export type ClaimSubject = "own_product" | "own_business" | "competitor" | "customer";

export type ClaimType =
  // Decided by code against a record.
  | "price"
  | "offer"
  | "shipping"
  | "duration"
  | "availability"
  | "count"
  | "credential"
  /**
   * A claim about the READER's own situation: that they have placed an
   * order, that it is on its way, that a booking exists, that they are
   * a member, that something is reserved for them.
   *
   * Added 2026-10-16 after the recall gate missed
   * "Aapka lavender candle aa raha hai" — "your lavender candle is on
   * its way" — in a case where no records could be read at all. It
   * asserts that an order exists, and it was phrased as a greeting, so
   * none of the other twelve types fitted and the extractor reported no
   * claim. A claim nobody enumerates is a claim nobody judges.
   */
  | "customer_state"
  // Decided by a licence on the cited record.
  | "material"
  | "process"
  // No source in the system licenses these. See factRecord.LICENCES.
  | "capability"
  | "comparison"
  | "benefit"
  | "safety";

export type ExtractedClaim = {
  /** Which sentence of the input, 0-based. */
  sentenceIndex: number;
  /** English, plain, one assertion: "the candle burns slower than paraffin candles". */
  canonical: string;
  claimType: ClaimType;
  subject: ClaimSubject;
  polarity: "assert" | "deny" | "hedge";
  /** Present only when the claim carries a figure. Code checks these, never a judge. */
  value?: { number: number; unit: string } | null;
  /** Set whenever subject is "competitor" — what the comparison is against. */
  comparedWith?: string | null;
};

export const CLAIM_TYPES: ClaimType[] = [
  "price", "offer", "shipping", "duration", "availability", "count", "credential",
  "customer_state", "material", "process", "capability", "comparison", "benefit", "safety",
];

/** Claim types a record can never license, whatever is on file. */
export const UNLICENSABLE_TYPES: ClaimType[] = ["capability", "comparison", "benefit", "safety"];

/**
 * Claims that can only be backed by a record about THIS RECIPIENT — a
 * real order row, a real booking — and not by anything about the
 * business in general.
 *
 * `business.paid_orders = 2` does not establish that the person reading
 * this has one of them. getContext carries no per-recipient records
 * today, so in practice nothing in the context can support a
 * customer_state claim and the verifier must refuse it. That is the
 * founder's rule of 2026-10-16: backed by a real order or lead row, or
 * it is false.
 *
 * Kept separate from UNLICENSABLE_TYPES because the difference is real:
 * a benefit claim can never be supported by anything, while this one
 * becomes supportable the day a send carries the recipient's own row.
 */
export const NEEDS_RECIPIENT_RECORD: ClaimType[] = ["customer_state"];

const TOOL = {
  name: "report_claims",
  description:
    "Report every factual claim the text makes. Do not judge whether any of them is true — you have no records and must not guess.",
  input_schema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sentenceIndex: { type: "integer", description: "Which numbered sentence this claim comes from." },
            canonical: {
              type: "string",
              description:
                "The claim restated in plain English, one assertion only, whatever language the sentence was in. Name the subject explicitly — what the claim is ABOUT and what is being said of it — rather than leaving a bare predicate like 'lasts longer'.",
            },
            claimType: { type: "string", enum: CLAIM_TYPES },
            subject: { type: "string", enum: ["own_product", "own_business", "competitor", "customer"] },
            polarity: {
              type: "string",
              enum: ["assert", "deny", "hedge"],
              description:
                "assert = states it. deny = states it is not so ('no paraffin', 'paraffin nahi'). hedge = suggests it without committing ('deserves a closer look').",
            },
            value: {
              type: "object",
              description: "Only when the claim carries a figure. Copy the figure from the text; never compute one.",
              properties: { number: { type: "number" }, unit: { type: "string" } },
              required: ["number", "unit"],
            },
            comparedWith: {
              type: "string",
              description: "What the claim compares against, when it compares with anything outside this business.",
            },
          },
          required: ["sentenceIndex", "canonical", "claimType", "subject", "polarity"],
        },
      },
    },
    required: ["claims"],
  },
} as const;

const SYSTEM = `You read marketing copy and list the factual claims it makes. You are a reader, not an editor and not a judge.

RULES
1. One claim per assertion. A sentence making two claims produces two entries; a sentence making none produces none.
2. The text may be in English, Hindi, Hinglish (romanised Hindi) or Devanagari, often mixed inside one sentence. Read all of it. State every claim in plain English.
3. A claim is anything a customer could check and find false. Greetings, feelings, invitations, questions and calls to action are NOT claims.
4. State what the words MEAN, not what they say. A sentence saying this one performs better, lasts longer or is cleaner than the ordinary sort is a comparison, however it is phrased and in whatever language. A sentence saying the business takes care of something for the customer by itself is a capability claim.
5. A claim about anyone else's product or service — named, or implied by phrases like "the ordinary kind", "what most places use", "the usual sort", "ke mukable", "jaisa aksar hota hai" — has subject "competitor" and claimType "comparison". Set comparedWith to whatever it is measured against.
6. A claim that something improves or protects the customer's health, sleep, mood, body or appearance is claimType "benefit". A claim that something is safe, non-toxic, gentle or suitable for babies, children, pregnancy or sensitive skin is "safety". These are claims even when softly worded.
7. A claim about what the business or its software WILL DO for the customer on its own — remember, remind, rebook, repeat, deliver or follow up automatically — is claimType "capability", even when it is phrased as reassurance rather than as a promise.
8. Copy figures exactly as written. Never convert, round or compute. A figure written in words, in Devanagari digits or beside a unit in another language is still that figure.
9. A hedge is still a claim. Casting doubt on a widely held belief, or inviting the reader to reconsider one, asserts the opposite of that belief — type it by what is being implied, with polarity "hedge".
10. A sentence about the READER's own situation — that they have ordered something, that it is on its way, that they have a booking, that something is reserved or being prepared for them — is claimType "customer_state", subject "customer". Report it even when it is phrased as a greeting, a welcome or a reassurance, because it asserts that a real order or booking exists.
11. A VAGUE PROMISE IS STILL THE PROMISE. "Just come once, we'll take care of the rest", "leave it to us", "baaki hum sambhal lete hain" name nothing and commit to everything: report them as the capability claim they stand for. Never skip a sentence because another sentence nearby says the same thing more plainly — each sentence may be sent, posted or read on its own, and a sentence you pass over is a sentence nobody checks.
10. You have no records. Never say whether a claim is supported.`;

/** Numbered, so a claim can point back at the sentence it came from. */
export function numberSentences(sentences: string[]): string {
  return sentences.map((s, i) => `[${i}] ${s}`).join("\n");
}

export type ExtractResult =
  | { ok: true; claims: ExtractedClaim[]; costInr: number }
  | { ok: false; reason: string; costInr: number };

/**
 * The claims a piece of copy makes, in English, whatever language it is in.
 *
 * FAILS CLOSED. A model failure returns ok: false, and the caller must
 * treat that as "not verified" rather than "nothing found" — an empty
 * claim list and a failed call look identical from the outside and mean
 * opposite things.
 */
export async function extractClaims(
  sentences: string[],
  opts: { logContext?: { supabase: any; dealershipId: string } | null; model?: string } = {}
): Promise<ExtractResult> {
  const clean = sentences.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!clean.length) return { ok: true, claims: [], costInr: 0 };

  const result = await callClaude(
    {
      // Haiku by default: this is enumeration, not judgement. The
      // founder's gate decides whether it is good enough at Hinglish,
      // and the model is an argument so the gate can price the
      // alternative.
      model: opts.model ?? CLAUDE_MODELS.fast,
      // TEMPERATURE 0, AND LEAVING IT UNSET WAS A REAL BUG.
      //
      // Found in gate run 3 of 2026-10-16. "There is a long-standing
      // assumption that ghee leads to weight gain — but that idea
      // deserves a closer look" was enumerated as a hedged claim in two
      // runs and missed in the third — same sentence, same prompt, three
      // draws, two hits. The default temperature of 1.0 was sampling.
      //
      // This step ENUMERATES; it does not compose. Variation here is not
      // flair, it is a claim that gets checked on Monday and shipped on
      // Tuesday, and no gate can certify a stochastic reader on one
      // draw.
      temperature: 0,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `Sentences:\n${numberSentences(clean)}` }],
    },
    { operation: "claim_extraction", logContext: opts.logContext ?? null, attempts: 2, timeoutMs: 60_000 }
  );

  if (!result.ok) return { ok: false, reason: result.failure.message, costInr: 0 };

  const block = (result.data?.content ?? []).find((c: any) => c?.type === "tool_use" && c?.name === TOOL.name);
  if (!block) return { ok: false, reason: "the model did not use the tool", costInr: result.costInr };

  const raw = Array.isArray(block.input?.claims) ? block.input.claims : null;
  if (!raw) return { ok: false, reason: "the tool call carried no claims array", costInr: result.costInr };

  return {
    ok: true,
    claims: raw.map((c: unknown) => normalise(c)).filter((c: ExtractedClaim | null): c is ExtractedClaim => c !== null),
    costInr: result.costInr,
  };
}

/**
 * One claim, or null.
 *
 * A model-supplied claimType outside the enum is DROPPED rather than
 * coerced: a claim typed "healthy" that silently became "material"
 * would be judged by the wrong rule, and a dropped claim at least shows
 * up as a gap in the recall measurement.
 */
function normalise(c: any): ExtractedClaim | null {
  const canonical = String(c?.canonical ?? "").trim();
  if (!canonical) return null;
  const claimType = CLAIM_TYPES.find((t) => t === c?.claimType);
  if (!claimType) return null;
  const subject = (["own_product", "own_business", "competitor", "customer"] as const).find((s) => s === c?.subject);
  if (!subject) return null;
  const polarity = (["assert", "deny", "hedge"] as const).find((p) => p === c?.polarity) ?? "assert";
  const index = Number(c?.sentenceIndex);
  const value =
    c?.value && Number.isFinite(Number(c.value.number))
      ? { number: Number(c.value.number), unit: String(c.value.unit ?? "").trim() }
      : null;
  return {
    sentenceIndex: Number.isInteger(index) && index >= 0 ? index : 0,
    canonical,
    claimType,
    subject,
    polarity,
    value,
    comparedWith: c?.comparedWith ? String(c.comparedWith).trim() : null,
  };
}

/** True when nothing on record could ever license this claim. */
export function needsNoRecord(claim: ExtractedClaim): boolean {
  return UNLICENSABLE_TYPES.includes(claim.claimType) || claim.subject === "competitor";
}
