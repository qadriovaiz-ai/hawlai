// C2 STEP 4b — IS EACH CLAIM THE COPY MAKES ACTUALLY SUPPORTED?
//
// docs/PLAN-CORE-ARCHITECTURE.md §2.1. Step 4a read the finished copy
// and listed the claims it makes, in English, with no records in front
// of it. This step decides each one.
//
// THE SPLIT THAT MATTERS: no figure is ever shown to a judge. Prices,
// offers, shipping, durations and counts are decided by arithmetic
// against the approved claims — which step 2 already checked against
// the records. Only qualitative claims reach the model, and then with a
// fixed rubric and one call for the whole piece.
//
// WHY ARITHMETIC AND NOT A PROMPT. "Both start from Rs 850" was
// reviewer-graded false because the Lavender is Rs 999, and Rs 850 was
// a real price — of the other product. A judge asked "is Rs 850 right?"
// can be convinced. Comparing two numbers cannot.

import { callClaude } from "@/lib/ai/claude";
import { CLAUDE_MODELS } from "@/lib/models";
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES, placeholderFree, type ExtractedClaim } from "@/lib/facts/extractClaims";
import type { SelectedClaim } from "@/lib/facts/selectClaims";
import type { FactRecord } from "@/lib/facts/factRecord";
import { describeCoverage, inheritsFromBusiness, recordSupportsScope, sameProductName, scopeOfKey } from "@/lib/facts/scope";
import { atScale, isScaleOnly } from "@/lib/facts/scale";
import { figureInText } from "@/lib/facts/validateSelection";

/** Claim types whose verdict is arithmetic, never judgement. */
export const NUMERIC_TYPES = new Set(["price", "offer", "shipping", "duration", "count"]);

export type Verdict = {
  claim: ExtractedClaim;
  verdict: "entailed" | "unsupported";
  /** Which rule decided, so a report can group and a human can argue. */
  rule: "no_licence_exists" | "needs_recipient_record" | "figure_not_approved" | "figure_matches" | "judged_entailed" | "judged_unsupported" | "judge_unavailable";
  /** Said plainly. This reaches the owner. */
  reason: string;
};

export type VerifyResult = {
  verdicts: Verdict[];
  /** Sentence indices to drop: any sentence carrying an unsupported claim. */
  unsupportedSentences: number[];
  costInr: number;
  /** True when the judge could not be reached, so qualitative claims are unverified. */
  degraded: boolean;
};

/** "hours" and "hour" are one unit; "ghante" should never arrive, but it is harmless if it does. */
function sameUnit(a: string | undefined, b: string | null | undefined): boolean {
  // "currency" IS A UNIT A MODEL ACTUALLY RETURNS. The S1 exit run
  // refused a correct ₹3,500 twice, because the extractor called the
  // unit "currency" and the record calls it "inr". Any name for money
  // is money.
  // AN EXACT TABLE, MAPPED BEFORE THE PLURAL IS STRIPPED. The first
  // version stripped a trailing "s" first, which turned "rs" into "r"
  // and refused a correct price — the same class of fault as the bug
  // this fix exists for, found by its own test.
  const SYNONYMS: Record<string, string> = {
    inr: "inr", rs: "inr", "rs.": "inr", rupee: "inr", rupees: "inr", "₹": "inr",
    currency: "inr", money: "inr", price: "inr", paisa: "inr", paise: "inr",
    hour: "hour", hours: "hour", hr: "hour", hrs: "hour",
    ghante: "hour", ghanta: "hour", "घंटे": "hour", "घंटा": "hour",
    minute: "minute", minutes: "minute", min: "minute", mins: "minute", mint: "minute",
    day: "day", days: "day", din: "day",
    percent: "percent", percents: "percent", pc: "percent", "%": "percent",
  };
  // placeholderFree FIRST, so "<UNKNOWN>" arrives as absent rather than
  // as a unit that contradicts every real one. One definition, shared
  // with the extractor that produces these.
  const norm = (u: string) => {
    const raw = placeholderFree(u).toLowerCase().trim();
    return SYNONYMS[raw] ?? raw.replace(/s$/, "");
  };
  // A SCALE WORD IS A SIZE, NOT A KIND. "Rs 72 lakh" has unit "lakh",
  // which says nothing about currency, so it must not be refused for
  // disagreeing with the record's "inr".
  if (isScaleOnly(a) || isScaleOnly(b)) return true;
  const x = norm(a ?? "");
  const y = norm(b ?? "");
  // An absent unit on either side is not a mismatch: "999" and "₹999"
  // are the same claim, and the number is what carries the risk.
  if (!x || !y) return true;
  return x === y;
}

/**
 * A record's value as a scaled number, or null when it is not a number.
 *
 * NULL FOR A BOOLEAN, and a test caught me losing that. My first
 * version of the scale change passed `atScale(Number(a.value), a.unit)`
 * straight into sameNumber - and Number(false) is 0, so the boolean
 * guard that sameNumber exists for was bypassed and a claim of "Rs 0"
 * could match a record whose value is false. "A BOOLEAN RECORD CANNOT
 * BACK A FIGURE OF ZERO" went red, which is exactly what it is for.
 */
function scaledNumber(value: unknown, unit: string | null | undefined): number | null {
  if (typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? atScale(n, unit) : null;
}

function sameNumber(a: number, b: unknown): boolean {
  // A BOOLEAN IS NOT A NUMBER, however willing JavaScript is to make it
  // one. Number(false) is 0, so without this a claim stating 0 — "₹0",
  // "free" — would match any record whose value is false.
  if (typeof b === "boolean") return false;
  const y = Number(b);
  return Number.isFinite(y) && Math.abs(a - y) < 0.005;
}

const JUDGE_TOOL = {
  name: "report_verdicts",
  description: "For each numbered claim, say whether the approved facts support it.",
  input_schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer", description: "The claim's number, as given." },
            entailed: { type: "boolean", description: "True only if an approved fact states this, or states something that necessarily includes it." },
            why: { type: "string", description: "One short line. Name the approved fact, or say what is missing." },
          },
          required: ["index", "entailed", "why"],
        },
      },
    },
    required: ["verdicts"],
  },
} as const;

const JUDGE_SYSTEM = `You decide whether a list of approved facts supports each claim. You are strict and you are literal.

A claim is ENTAILED only if an approved fact states it, or states something that necessarily includes it. Everything else is not entailed, including claims that are probably true, usually true, true of the category, or true of most businesses like this one.

RULES
1. More specific than the fact is NOT entailed. "made of one material" does not support "made ONLY of that material". "takes ninety minutes" does not support "takes under an hour".
2. Stronger than the fact is NOT entailed. "no X is used" does not support "nothing harsh is used". An absence of one thing is not an absence of a kind of thing.
3. A fact about the thing itself does not support a claim about its EFFECT on a person, or about anyone else's product. If you see such a claim, it is not entailed.
4. A fact that something is not known does not support a claim either way.
5. WORDING AND WORD ORDER DO NOT CHANGE A CLAIM. Rephrasing in another language is the same claim, and so is rephrasing in the same one: "<material> only" and "only <material>" are one fact, not two. Judge what is asserted, never how it is arranged. If the only difference you can name is the order of the words, the answer is entailed.
6. When you are unsure, the answer is not entailed. A claim nobody can trace to a fact is the thing this step exists to catch.
7. TWO FACTS DO NOT ENTAIL A LINK BETWEEN THEM. If the approved facts state A and state B, a claim that A causes B, explains B, proves B or results in B is NOT entailed — the connection is a separate assertion and no fact here makes it. This holds however plausible the mechanism sounds.
8. SCOPE IS NOT YOURS TO DECIDE. Which facts may be used for which claim has already been settled in code before you see it, so every fact below is CLEARED for the claim it sits with. Never answer "not entailed" on the ground that a fact is about the business in general rather than about one named product — that objection is not available to you. Judge only whether the fact, applied to this claim, states it.
9. EACH CLAIM CARRIES ITS OWN EVIDENCE, UNDER TWO HEADINGS, AND BOTH HEADINGS ARE EVIDENCE OF EQUAL STANDING. Under a claim you may see "FACTS CHOSEN FOR THIS PIECE THAT CAN COVER THIS CLAIM" and "ALSO ON RECORD AND ABLE TO COVER THIS CLAIM". THE SECOND HEADING IS NOT WEAKER THAN THE FIRST. It is the rest of what the owner has written down, and a claim stated by anything under it is ENTAILED exactly as if it had been chosen - the owner recorded it, so it is true of their business, and which facts a writer found useful decides nothing about what is true. NEVER answer "not entailed" because a fact was "not chosen for this claim" - like rule 8, that objection is not available to you, and on 2026-10-21 refusing on exactly that ground deleted two sentences about how the owner makes <the item> and what it is made of, both of which she had written down herself. EVERYTHING UNDER A CLAIM HAS ALREADY BEEN CHECKED FOR SCOPE IN CODE: a fact only appears under a claim it can actually cover, so you never have to judge whether a fact is about the right product - if it is there, it is allowed to be. WHAT DOES NOT CHANGE: the fact must still STATE the claim. More evidence to read is not a lower standard to meet. And a claim with "NO FACT CHOSEN FOR THIS PIECE CAN COVER THIS CLAIM" and nothing under the second heading is not entailed, which is the answer however much is on file elsewhere.
10. WHERE A BUSINESS IS, AND WHAT IT CHARGES TO DELIVER, DO NOT ADD UP TO WHERE IT DELIVERS. This is the causal rule in the one place the second list makes it easy to break: two records, each true, sitting next to each other. A city on record says where the business IS. A delivery rate on record says what delivery COSTS. Neither says, and the two together do not say, which places are delivered to - that needs a record of the coverage itself, naming the area, the pin codes or the radius. "We deliver to your door in Indore" is NOT ENTAILED by "the business is in Indore" plus "delivery costs Rs 50", and the founder's blind grading of 2026-10-20 marked exactly that sentence false. THE SAME TRAP IN ITS OTHER FORMS: opening hours plus a phone number do not establish that anyone answers; a price plus a product do not establish that it is in stock; a process plus a material do not establish a result. Ask of every claim: is there ONE record that states this, or am I adding two together?
9. You are deciding MEANING. Is the claim what the fact says, or more than the fact says? That is the whole question.`;

/**
 * The approved facts, as the judge reads them. Plain lines, no ids.
 *
 * A FALSE VALUE IS RENDERED IN WORDS, AND THAT IS NOT COSMETIC.
 *
 * The S1 exit run of 2026-10-16 refused "the treatment is ammonia-free"
 * ON THE GROUND THAT THE RECORD SAID THE OPPOSITE. The record was
 * `material.ammonia = false` — the salon does not use ammonia, which is
 * exactly what the copy said. This function printed the value whenever
 * it was not null, undefined or "", and `false` is none of those, so the
 * judge was shown:
 *
 *     - no ammonia-based products (false)
 *
 * and read the parenthetical as marking the claim false. A missing
 * licence refuses a sentence; an inverted fact refuses a TRUE one and
 * tells the owner their own record contradicts them.
 *
 * So a boolean never appears as a bare value. `false` says the thing is
 * NOT used or present; `true` says it is.
 */
export function approvedForJudge(
  approved: SelectedClaim[],
  records: FactRecord[] = [],
  aboutProduct?: string | null,
  writtenClaimType?: string | null
): string {
  return approved
    .filter((c) => supportsProduct(c, records, aboutProduct, writtenClaimType))
    .map((c) => `- ${c.intent || c.claimType}${valueForJudge(c)}${citedWords(c, records)}${scopeLine(c, records)}`)
    .join("\n");
}

/**
 * Can this APPROVED claim be evidence for a written claim about
 * `aboutProduct`?
 *
 * THE HOLE THE FOUNDER FOUND TWICE. On 2026-10-20 I filtered the
 * judge's SECOND list by scope and reported the hand-churning bug
 * fixed. It was not: the leak is in the FIRST list, which was never
 * filtered at all, and "Fresh paneer just made - hand-churned, no
 * preservatives" came back on the very next run.
 *
 * What the judge was shown for a claim about the paneer:
 *
 *   - we hand-churn
 *       recorded as: "Haath se churn karte hain."
 *       this fact covers: recorded about the business, so it covers
 *       what the business makes in general
 *
 * That last line does not merely permit the crossover, IT INVITES IT.
 * A collective claim Select approved perfectly correctly - the business
 * does hand-churn - was handed to the judge as evidence about one named
 * product, with a note saying it covers everything the business makes.
 *
 * THE FOUNDER'S RULE OF 16 OCTOBER, applied in the direction nobody
 * applied it: a claim about ONE SPECIFICALLY NAMED product needs
 * evidence about THAT product. It was enforced on Select's claims, each
 * against its own aboutProduct, and never between the WRITER's claim
 * and the evidence put in front of the judge for it.
 *
 * A collective written claim is unaffected: when the writer names no
 * one product every approved claim is fair evidence, which is what
 * keeps "the candles burn for 40 hours" sayable.
 */
function supportsProduct(
  claim: SelectedClaim,
  records: FactRecord[],
  aboutProduct?: string | null,
  /**
   * The type of the WRITTEN claim this evidence is for — not the
   * selected claim's own type. A credential is held by the business and
   * inherited by what it sells, so for that one class a business-level
   * record is allowed in. Everything else keeps the 20 October rule.
   */
  writtenClaimType?: string | null
): boolean {
  if (!aboutProduct) return true;
  if (claim.aboutProduct && sameProductName(claim.aboutProduct, aboutProduct)) return true;
  return claim.factIds.some((id) => {
    const record = records.find((r) => r.id === id);
    if (!record) return false;
    // Store-wide policy covers every product; a business-level fact
    // does not cover one named product — unless the claim is one the
    // product inherits from the business, which is credentials only.
    if (scopeOfKey(record.key).kind === "business") {
      return inheritsFromBusiness(writtenClaimType);
    }
    return recordSupportsScope(record.key, aboutProduct, writtenClaimType);
  });
}

/**
 * The records Select did NOT choose for this piece, in the owner's own
 * words.
 *
 * THE FOUNDER'S DECISION OF 2026-10-20, and his reasoning is the whole
 * of it: SELECT IS CURATION, NOT GATEKEEPING. His rule has always been
 * that what is in the record may be written. The judge was shown only
 * the claims Select chose, so the pipeline was enforcing something
 * narrower - that only what Select CHOSE may be written.
 *
 * Run 12 is where the two came apart. dairy-10's copy said "The paneer
 * is fresh." and the judge removed it: "No approved fact states
 * anything about the paneer's freshness." It is recorded -
 * product.paneer_250g.description says "Made fresh every morning" - and
 * Select had simply picked other facts for a message about delivery. A
 * true, recorded, product-scoped sentence deleted because of which
 * facts a model found most useful ten seconds earlier.
 *
 * MARKED, NOT MIXED IN. The judge is told which facts were chosen for
 * this piece and which were merely on file, because the two mean
 * different things to an owner reading the note afterwards - and
 * because a claim resting on an unchosen record is exactly the case
 * worth being able to see later.
 *
 * WHAT THIS DOES NOT LOOSEN. Scope is still scope: a record about one
 * product still says nothing about another, and the rubric's rule 8
 * still stands. The unlicensable types never reach the judge at all,
 * and a figure is still decided by arithmetic. This widens the EVIDENCE
 * the judge may read, not the standard it applies.
 */
export function alsoOnRecord(
  approved: SelectedClaim[],
  records: FactRecord[],
  aboutProduct?: string | null,
  writtenClaimType?: string | null
): string {
  const cited = new Set(approved.flatMap((c) => c.factIds));
  // SCOPE IS ENFORCED HERE, IN CODE, NOT LEFT TO THE RUBRIC.
  //
  // THE FOUNDER'S BUG REPORT OF 2026-10-20: "made by hand-churning"
  // belongs to the ghee and not to the paneer, and the pipeline was
  // letting it cross over.
  //
  // The scope rule already refuses that at step 2 -
  // recordSupportsScope("process.hand_churned", "paneer") is false,
  // because a business-level process record cannot carry a claim about
  // one named product. The leak was the SECOND LIST added the same
  // day: every unchosen record went to the judge in one block, and
  // rubric rule 8 tells the judge that scope objections are "not
  // available to you" - true while every fact it saw had been cleared
  // in code, false the moment this list existed.
  //
  // So the filter sits where it cannot be talked out of. A
  // business-level record still covers a COLLECTIVE claim, because
  // recordSupportsScope returns true when the claim names no one
  // product - which is what keeps "the candles burn for 40 hours"
  // sayable.
  const rest = records.filter(
    (r) =>
      !cited.has(r.id) &&
      r.value !== null &&
      r.value !== undefined &&
      r.value !== "" &&
      recordSupportsScope(r.key, aboutProduct, writtenClaimType)
  );
  if (!rest.length) return "";
  return rest.map((r) => `- ${r.recordedText}${r.unit ? ` (${r.value} ${r.unit})` : ""} [${describeCoverage(r.key)}]`).join("\n");
}

/**
 * The cited records' OWN WORDS, beside the claim.
 *
 * THE S1 EXIT RUN REMOVED A TRUE SENTENCE BECAUSE OF THIS. The dairy's
 * row says "Haath se churn karte hain" — hand-churned. The copy said
 * "made using the traditional hand-churned method", and the judge
 * refused it: "Approved fact mentions 'traditional Bilona method' but
 * does not specify 'hand-churned'".
 *
 * The judge was right about what it was shown, and what it was shown
 * was the SELECT MODEL'S `intent` — a paraphrase. This pipeline's whole
 * claim is that records are the evidence, and the one place that claim
 * is tested was reading a summary written by a model.
 *
 * So the record's recordedText travels with the claim. In whatever
 * language the owner wrote it: the judge is told to read meaning, not
 * wording, and an owner's Hinglish sentence is the most direct evidence
 * there is.
 */
function scopeLine(claim: SelectedClaim, records: FactRecord[]): string {
  // THE JUDGE IS TOLD EACH FACT'S SCOPE, rather than left to infer it
  // from a key it never sees. Rule 7 of its rubric asks it to separate a
  // store-wide policy from one product's own fact, and it cannot do
  // that on a paraphrase alone.
  if (!records.length) return "";
  const scopes = claim.factIds
    .map((id) => records.find((r) => r.id === id))
    .filter((r): r is FactRecord => Boolean(r))
    .map((r) => describeCoverage(r.key));
  if (!scopes.length) return "";
  return `\n    this fact covers: ${Array.from(new Set(scopes)).join("; ")}`;
}

function citedWords(claim: SelectedClaim, records: FactRecord[]): string {
  if (!records.length) return "";
  const words = claim.factIds
    .map((id) => records.find((r) => r.id === id)?.recordedText)
    .map((t) => String(t ?? "").trim())
    .filter(Boolean);
  if (!words.length) return "";
  return `\n    recorded as: ${Array.from(new Set(words)).map((w) => `"${w}"`).join("; ")}`;
}

function valueForJudge(c: SelectedClaim): string {
  if (c.value === null || c.value === undefined || c.value === "") return "";
  // The two spellings a model can arrive at for the same boolean.
  if (c.value === false || c.value === "false") return " — recorded as NOT used and NOT present in this business's work";
  if (c.value === true || c.value === "true") return " — recorded as true of this business";
  return ` (${c.value}${c.unit ? ` ${c.unit}` : ""})`;
}

/**
 * Decide every claim the copy makes.
 *
 * FAILS CLOSED ON THE JUDGE. If the judge cannot be reached, the
 * qualitative claims are reported as unsupported and `degraded` is set,
 * so the caller marks the draft unverified rather than treating silence
 * as approval.
 */
export async function verifyClaims(
  extracted: ExtractedClaim[],
  approved: SelectedClaim[],
  opts: { logContext?: { supabase: any; dealershipId: string } | null; model?: string; records?: FactRecord[] } = {}
): Promise<VerifyResult> {
  const verdicts: Verdict[] = [];
  const forJudge: ExtractedClaim[] = [];

  for (const claim of extracted) {
    // 1. Nothing could ever support it. No call, no judgement.
    if (UNLICENSABLE_TYPES.includes(claim.claimType) || claim.subject === "competitor") {
      verdicts.push({
        claim,
        verdict: "unsupported",
        rule: "no_licence_exists",
        reason:
          claim.subject === "competitor" || claim.claimType === "comparison"
            ? "it compares with someone else's product, and nothing this business records about itself can establish that"
            : `nothing on record can support a ${claim.claimType} claim`,
      });
      continue;
    }

    // 2. A claim about the reader's own order. Founder's rule: backed by
    // a real order or lead row for this recipient, or it is false — and
    // no send carries one today.
    if (NEEDS_RECIPIENT_RECORD.includes(claim.claimType)) {
      verdicts.push({
        claim,
        verdict: "unsupported",
        rule: "needs_recipient_record",
        reason: "it says something about the reader's own order or booking, and nothing here knows who is reading it",
      });
      continue;
    }

    // 3. ARITHMETIC, for anything carrying a figure. The figure must be
    // one an approved claim carries — and every approved claim's figure
    // was already matched to a record in step 2.
    if (claim.value && NUMERIC_TYPES.has(claim.claimType)) {
      // THE FIGURE MUST BELONG TO THE THING THE SENTENCE IS ABOUT.
      //
      // The hole this closes, found 18 October: the match ignored which
      // product a figure belonged to, so "the Rose candle costs Rs 999"
      // was entailed by the LAVENDER's Rs 999. A wrong price on the
      // wrong product — the same class of failure as candle-03's "both
      // start from Rs 850", and it would have passed every check.
      //
      // A claim naming no product matches any approved figure, as
      // before: "shipping is Rs 50" is about the store.
      // TOLERANT, not exact. Slug equality refused a true price on 18
      // October: the sentence said "ghee", the catalogue said "Desi ghee
      // 500ml". sameProductName asks whether one name's words are all
      // present in the other's.
      const sameThing = (a: SelectedClaim) =>
        !claim.aboutProduct || !a.aboutProduct || sameProductName(claim.aboutProduct, a.aboutProduct);
      // SCALED BEFORE COMPARING. "1.2 crore" and 12000000 are the same
      // number written two ways, and the tier-2 gate of 2026-10-20
      // caught five true recorded prices being refused for it.
      const stated = atScale(claim.value!.number, claim.value!.unit);
      const match = approved.find((a) => {
        const recorded = scaledNumber(a.value, a.unit);
        return recorded !== null && sameNumber(stated, recorded) && sameUnit(claim.value!.unit, a.unit) && sameThing(a);
      });
      // THE RECORDS ARE THE AUTHORITY ON A FIGURE, NOT THE CLAIM LIST,
      // and the fourth S2a WhatsApp run of 2026-10-19 is why this
      // second look exists. Two true figures were removed:
      //
      //   "The paneer is 250g."         250 is in the product's own NAME,
      //                                 "Paneer 250g" — it is not the
      //                                 value of any approved claim
      //   "The candles burn for 40 hours."
      //                                 40 is in a business-level record,
      //                                 product.burn_hours = 40 hours, so
      //                                 it is true of the range; the
      //                                 approved claim had been attached
      //                                 to one candle, and the writer
      //                                 widened it correctly
      //
      // Step 2 has always checked a figure against the record's own
      // words (figureInText) as well as its value. Step 4 checked only
      // the approved values, so a figure written into a record's TEXT
      // was unverifiable here however true it was. The same function now
      // runs at both ends.
      //
      // THE FOUNDER'S RULE IS "ONLY WHAT IS IN THE RECORD MAY BE
      // WRITTEN" — not "only what Select happened to pick". A figure
      // present verbatim in a record whose scope covers this claim is
      // in the record.
      //
      // SCOPE STILL DECIDES, so this is not a way round the scope rule:
      // a business-level or policy record covers the range, while a
      // product record covers only its own product. "The Rose candle
      // costs Rs 999" still finds nothing, because the 999 lives in the
      // Lavender's record.
      const inRecords =
        match
          ? null
          : (opts.records ?? []).find((r) => {
              if (!figureInText(r, claim.value!.number) && !figureInText(r, stated)) return false;
              const scope = scopeOfKey(r.key);
              if (scope.kind !== "product") return true;
              return !claim.aboutProduct || sameProductName(claim.aboutProduct, scope.product);
            });
      if (match || inRecords) {
        verdicts.push({
          claim,
          verdict: "entailed",
          rule: "figure_matches",
          reason: match
            ? `the records give ${match.value}${match.unit ? ` ${match.unit}` : ""}`
            : `it is in your records, written as "${inRecords!.recordedText}"`,
        });
      } else {
        const had = approved
          .filter((a) => a.value !== null && a.value !== undefined && a.value !== "")
          .map((a) => `${a.value}${a.unit ? ` ${a.unit}` : ""}`);
        const wrongThing =
          claim.aboutProduct &&
          approved.some((a) => {
            const recorded = scaledNumber(a.value, a.unit);
            return recorded !== null && sameNumber(stated, recorded) && sameUnit(claim.value!.unit, a.unit);
          });
        verdicts.push({
          claim,
          verdict: "unsupported",
          rule: "figure_not_approved",
          reason: wrongThing
            ? `it states ${claim.value.number}${claim.value.unit ? ` ${claim.value.unit}` : ""} for ${claim.aboutProduct}, and that figure belongs to something else`
            : had.length
            ? `it states ${claim.value.number}${claim.value.unit ? ` ${claim.value.unit}` : ""}, and the figures on record are ${had.join(", ")}`
            : `it states ${claim.value.number}${claim.value.unit ? ` ${claim.value.unit}` : ""}, and no figure was approved for this piece`,
        });
      }
      continue;
    }

    // 4. Everything else is a question of meaning. One call for the lot.
    forJudge.push(claim);
  }

  // Read before the short-circuit below, which depends on it.
  const unchosen = alsoOnRecord(approved, opts.records ?? []);

  if (!forJudge.length) {
    return { verdicts, unsupportedSentences: dropList(verdicts), costInr: 0, degraded: false };
  }

  // A piece with claims and NOTHING ON RECORD AT ALL needs no judge:
  // there is nothing for anything to be entailed BY.
  //
  // IT USED TO SAY "no approved facts", AND THAT IS NOW WRONG. Run 13,
  // salon-04: Select approved nothing for a message whose owner had
  // asked for free shipping on treatments, and this branch then refused
  // every sentence without a judge call - including "The business is
  // located in Indore", which is `business.city` and is on record.
  //
  // The founder's decision of 2026-10-20 is that Select is curation and
  // not gatekeeping. A model choosing no facts for one message must not
  // make the business's records disappear, and that is exactly what
  // this short-circuit did one commit after the rest of the change
  // landed. The judge now gets the call whenever there is a second list
  // to read.
  if (!approved.length && !unchosen) {
    for (const claim of forJudge) {
      verdicts.push({ claim, verdict: "unsupported", rule: "judged_unsupported", reason: "no fact was approved for this piece, so there is nothing to support it" });
    }
    return { verdicts, unsupportedSentences: dropList(verdicts), costInr: 0, degraded: false };
  }

  // PER CLAIM, NOT ONE SHARED BLOCK. A shared list of unchosen records
  // is a list the judge can apply to whatever claim it likes, and that
  // is how the ghee's hand-churning reached the paneer.
  const numbered = forJudge
    .map((c, i) => {
      const chosen = approvedForJudge(approved, opts.records ?? [], c.aboutProduct, c.claimType);
      const covering = alsoOnRecord(approved, opts.records ?? [], c.aboutProduct, c.claimType);
      const head =
        `[${i}] (${c.claimType}) ${c.canonical}` +
        (chosen
          ? `\n    FACTS CHOSEN FOR THIS PIECE THAT CAN COVER THIS CLAIM:\n${chosen
              .split("\n")
              .map((line) => `    ${line}`)
              .join("\n")}`
          : `\n    NO FACT CHOSEN FOR THIS PIECE CAN COVER THIS CLAIM.`);
      if (!covering) return head;
      const indented = covering
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      return `${head}\n    ALSO ON RECORD AND ABLE TO COVER THIS CLAIM:\n${indented}`;
    })
    .join("\n");
  const result = await callClaude(
    {
      model: opts.model ?? CLAUDE_MODELS.fast,
      temperature: 0,
      max_tokens: 1500,
      system: JUDGE_SYSTEM,
      tools: [JUDGE_TOOL],
      tool_choice: { type: "tool", name: JUDGE_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            // THE FIRST LIST IS PER CLAIM NOW TOO. A shared one is
            // exactly how a collective fact became one product's
            // attribute: see supportsProduct above.
            "",
            // THE SHARED BLOCK IS GONE. It used to sit here, and it is
            // where the ghee's hand-churning reached the paneer: one
            // list of unchosen records that the judge could apply to
            // any claim it liked. Each claim now carries the records
            // that can actually cover IT, filtered in code above by
            // recordSupportsScope.
            "",
            `\nClaims to decide:\n${numbered}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    },
    { operation: "claim_entailment", logContext: opts.logContext ?? null, attempts: 2, timeoutMs: 60_000 }
  );

  const block = result.ok ? (result.data?.content ?? []).find((c: any) => c?.type === "tool_use" && c?.name === JUDGE_TOOL.name) : null;
  const rows: any[] = Array.isArray(block?.input?.verdicts) ? block.input.verdicts : [];

  if (!result.ok || !block) {
    // DEGRADED, NOT APPROVED. Silence from the judge is not a pass, and
    // the caller is told so it can mark the draft rather than send it.
    for (const claim of forJudge) {
      verdicts.push({ claim, verdict: "unsupported", rule: "judge_unavailable", reason: "this could not be checked just now" });
    }
    return { verdicts, unsupportedSentences: dropList(verdicts), costInr: result.ok ? result.costInr : 0, degraded: true };
  }

  forJudge.forEach((claim, i) => {
    const row = rows.find((r) => Number(r?.index) === i);
    const entailed = row?.entailed === true;
    verdicts.push({
      claim,
      verdict: entailed ? "entailed" : "unsupported",
      rule: entailed ? "judged_entailed" : "judged_unsupported",
      // A claim the judge did not answer about is UNSUPPORTED, not
      // missing: a verdict list that skips a claim must not read as
      // approval of it.
      reason: String(row?.why ?? "the check returned no answer for this claim").trim(),
    });
  });

  return { verdicts, unsupportedSentences: dropList(verdicts), costInr: result.costInr, degraded: false };
}

function dropList(verdicts: Verdict[]): number[] {
  return Array.from(new Set(verdicts.filter((v) => v.verdict === "unsupported").map((v) => v.claim.sentenceIndex))).sort((a, b) => a - b);
}

/** What the owner is told about what came out. One line per claim, no jargon. */
export function verifyNote(result: VerifyResult): string | null {
  const bad = result.verdicts.filter((v) => v.verdict === "unsupported");
  if (!bad.length) return null;
  const lines = bad.map((v) => `Removed "${v.claim.canonical}" — ${v.reason}.`);
  if (result.degraded) lines.push("Some of this could not be checked just now, so it is marked unverified rather than treated as fine.");
  return lines.join("\n");
}
