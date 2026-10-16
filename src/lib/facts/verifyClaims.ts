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
  const norm = (u: string) =>
    String(u ?? "")
      .toLowerCase()
      .replace(/s$/, "")
      .replace(/^(?:ghante|ghanta|घंटे|घंटा)$/, "hour")
      .replace(/^(?:minute|min|mins)$/, "minute")
      .replace(/^(?:rupee|rs|inr|₹)$/, "inr")
      .trim();
  const x = norm(a ?? "");
  const y = norm(b ?? "");
  // An absent unit on either side is not a mismatch: "999" and "₹999"
  // are the same claim, and the number is what carries the risk.
  if (!x || !y) return true;
  return x === y;
}

function sameNumber(a: number, b: unknown): boolean {
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
6. When you are unsure, the answer is not entailed. A claim nobody can trace to a fact is the thing this step exists to catch.`;

/** The approved facts, as the judge reads them. Plain lines, no ids. */
export function approvedForJudge(approved: SelectedClaim[]): string {
  return approved
    .map((c) => `- ${c.intent || c.claimType}${c.value !== null && c.value !== undefined && c.value !== "" ? ` (${c.value}${c.unit ? ` ${c.unit}` : ""})` : ""}`)
    .join("\n");
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
  opts: { logContext?: { supabase: any; dealershipId: string } | null; model?: string } = {}
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
      const match = approved.find((a) => sameNumber(claim.value!.number, a.value) && sameUnit(claim.value!.unit, a.unit));
      if (match) {
        verdicts.push({ claim, verdict: "entailed", rule: "figure_matches", reason: `the records give ${match.value}${match.unit ? ` ${match.unit}` : ""}` });
      } else {
        const had = approved
          .filter((a) => a.value !== null && a.value !== undefined && a.value !== "")
          .map((a) => `${a.value}${a.unit ? ` ${a.unit}` : ""}`);
        verdicts.push({
          claim,
          verdict: "unsupported",
          rule: "figure_not_approved",
          reason: had.length
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
      messages: [{ role: "user", content: `Approved facts:\n${approvedForJudge(approved)}\n\nClaims to decide:\n${numbered}` }],
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
