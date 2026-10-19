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
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES, type ExtractedClaim } from "@/lib/facts/extractClaims";
import type { SelectedClaim } from "@/lib/facts/selectClaims";
import type { FactRecord } from "@/lib/facts/factRecord";
import { describeCoverage, sameProductName } from "@/lib/facts/scope";

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
  const norm = (u: string) => {
    const raw = String(u ?? "").toLowerCase().trim();
    return SYNONYMS[raw] ?? raw.replace(/s$/, "");
  };
  const x = norm(a ?? "");
  const y = norm(b ?? "");
  // An absent unit on either side is not a mismatch: "999" and "₹999"
  // are the same claim, and the number is what carries the risk.
  if (!x || !y) return true;
  return x === y;
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
5. Rephrasing in another language is still the same claim: judge the meaning, not the wording.
6. When you are unsure, the answer is not entailed. A claim nobody can trace to a fact is the thing this step exists to catch.
7. TWO FACTS DO NOT ENTAIL A LINK BETWEEN THEM. If the approved facts state A and state B, a claim that A causes B, explains B, proves B or results in B is NOT entailed — the connection is a separate assertion and no fact here makes it. This holds however plausible the mechanism sounds.
8. SCOPE IS NOT YOURS TO DECIDE. Which facts may be used for which claim has already been settled in code before you see it, so every fact below is CLEARED for the claim it sits with. Never answer "not entailed" on the ground that a fact is about the business in general rather than about one named product — that objection is not available to you. Judge only whether the fact, applied to this claim, states it.
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
export function approvedForJudge(approved: SelectedClaim[], records: FactRecord[] = []): string {
  return approved.map((c) => `- ${c.intent || c.claimType}${valueForJudge(c)}${citedWords(c, records)}${scopeLine(c, records)}`).join("\n");
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
      const match = approved.find(
        (a) => sameNumber(claim.value!.number, a.value) && sameUnit(claim.value!.unit, a.unit) && sameThing(a)
      );
      if (match) {
        verdicts.push({ claim, verdict: "entailed", rule: "figure_matches", reason: `the records give ${match.value}${match.unit ? ` ${match.unit}` : ""}` });
      } else {
        const had = approved
          .filter((a) => a.value !== null && a.value !== undefined && a.value !== "")
          .map((a) => `${a.value}${a.unit ? ` ${a.unit}` : ""}`);
        const wrongThing =
          claim.aboutProduct &&
          approved.some((a) => sameNumber(claim.value!.number, a.value) && sameUnit(claim.value!.unit, a.unit));
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

  if (!forJudge.length) {
    return { verdicts, unsupportedSentences: dropList(verdicts), costInr: 0, degraded: false };
  }

  // A piece with claims and no approved facts needs no judge: there is
  // nothing for anything to be entailed BY.
  if (!approved.length) {
    for (const claim of forJudge) {
      verdicts.push({ claim, verdict: "unsupported", rule: "judged_unsupported", reason: "no fact was approved for this piece, so there is nothing to support it" });
    }
    return { verdicts, unsupportedSentences: dropList(verdicts), costInr: 0, degraded: false };
  }

  const numbered = forJudge.map((c, i) => `[${i}] (${c.claimType}) ${c.canonical}`).join("\n");
  const result = await callClaude(
    {
      model: opts.model ?? CLAUDE_MODELS.fast,
      temperature: 0,
      max_tokens: 1500,
      system: JUDGE_SYSTEM,
      tools: [JUDGE_TOOL],
      tool_choice: { type: "tool", name: JUDGE_TOOL.name },
      messages: [{ role: "user", content: `Approved facts:\n${approvedForJudge(approved, opts.records ?? [])}\n\nClaims to decide:\n${numbered}` }],
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
