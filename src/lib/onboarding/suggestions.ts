// What we think the answer is, before the owner has said — D1.
//
// The three-bucket onboarding: discover what a site can tell us, show it
// as a pre-filled draft the owner confirms with one tap, and only ASK
// the questions nobody writes down. This module is the middle bucket —
// the drafts, and the four states they move through.
//
// ─────────────────────────────────────────────────────────────────────
// A SUGGESTION IS NOT AN ANSWER, AND THAT IS STRUCTURAL
// ─────────────────────────────────────────────────────────────────────
//
// `gatherBusinessFacts` reads `business_knowledge` and
// `business_listing_facts`. Those are what every generator, every chat
// reply and every published page is checked against. A suggestion lives
// in `interview_answers` instead (migration 232), and NOTHING in the
// facts layer reads that table.
//
// So an unconfirmed suggestion cannot reach a customer even if every
// other guard failed: `stripUnsupported` deletes it as unsupported,
// because there genuinely is no record behind it. The existing
// guarantee does the work; this module's job is to not break it by
// writing a draft somewhere a reader would trust.
//
// ─────────────────────────────────────────────────────────────────────
// FOUR STATES, TWO FIELDS
// ─────────────────────────────────────────────────────────────────────
//
// WHERE IT CAME FROM and WHAT WAS DECIDED are different facts, and one
// field cannot hold both. `source` is an origin and survives
// confirmation untouched; `status` is a decision and moves.
//
// A confirmed discovery still reads `discovered` forever. That is the
// point of keeping them apart: it is what lets anyone ask later how
// many of a business's recorded facts began as a guess.

import type { ProgressRow } from "./interviewProgress";

/** Where an answer originated. */
export type AnswerSource = "owner" | "discovered" | "inferred";

/**
 * The two origins a suggestion can have.
 *
 * `discovered` — a source states it in so many words, and `evidence`
 * carries the sentence. `inferred` — we worked it out from something
 * else, so there is no sentence to quote and the owner is being asked
 * to check a deduction rather than a transcription.
 *
 * The distinction is not cosmetic: a wrong transcription is a bug, a
 * wrong deduction is a judgement, and the owner deserves to know which
 * he is being shown.
 */
export const SUGGESTION_SOURCES: readonly AnswerSource[] = ["discovered", "inferred"];

export function isSuggestionSource(value: unknown): value is "discovered" | "inferred" {
  return typeof value === "string" && (SUGGESTION_SOURCES as readonly string[]).includes(value);
}

export function isAnswerSource(value: unknown): value is AnswerSource {
  return value === "owner" || isSuggestionSource(value);
}

/** A decision about a question. */
export type AnswerStatus = "answered" | "skipped" | "asked" | "suggested" | "rejected";

/**
 * Where a suggestion came from, in enough detail for the owner to check
 * it without leaving the card.
 *
 * `quote` IS REQUIRED FOR A DISCOVERY and absent for an inference,
 * which is the honest shape: there is nothing to quote when nobody
 * wrote it down. `storeSuggestion` refuses a discovery with no quote
 * rather than showing the owner a claim with no source.
 */
export type Evidence = {
  /** What kind of source: "hawlai_site", "external_site", "instagram", "catalogue". */
  sourceKind: string;
  /** The page it came from, when there is one. */
  url?: string | null;
  /** The sentence that says it. Required for a discovery. */
  quote?: string | null;
};

export type Suggestion = {
  questionKey: string;
  /** What we think the answer is, in the words the owner will see. */
  value: string;
  source: "discovered" | "inferred";
  evidence: Evidence;
};

/** How much of a page sentence is kept as the quote. */
export const QUOTE_CHARS = 300;
/** How long a suggested answer may be before it is cut. */
export const SUGGESTION_CHARS = 500;

/**
 * Whether this question is still open to a suggestion.
 *
 * ANSWERED, SKIPPED AND REJECTED ARE ALL "LEAVE IT ALONE", for three
 * different reasons that happen to agree:
 *
 *   answered  the owner has told us; a guess must never overwrite a
 *             fact, and discovery runs more than once
 *   skipped   the owner declined the question itself, and a suggestion
 *             is a way of asking it again
 *   rejected  the owner has already seen a suggestion for this and said
 *             no. Offering another one is arguing with him
 *
 * A row that is `suggested` already may be REPLACED — a later, better
 * discovery should win over an earlier guess the owner has not looked
 * at yet.
 */
export function acceptsSuggestion(row: ProgressRow | null | undefined): boolean {
  const status = String((row as any)?.status ?? "").trim();
  if (!status) return true;
  return status === "suggested" || status === "asked";
}

/**
 * The suggestion to store, or a reason it was refused.
 *
 * PURE, so every rule here is testable without a database — and so the
 * refusals are visible rather than being an early `return` inside a
 * write.
 */
export function prepareSuggestion(
  suggestion: Suggestion,
  existing?: ProgressRow | null
): { ok: true; row: { question_key: string; status: "suggested"; source: string; suggested_value: string; evidence: Evidence } } | { ok: false; why: string } {
  const key = String(suggestion?.questionKey ?? "").trim();
  if (!key) return { ok: false, why: "no question key" };

  const value = String(suggestion?.value ?? "").trim();
  if (!value) return { ok: false, why: "a suggestion with no value is not a suggestion" };

  if (!isSuggestionSource(suggestion?.source)) {
    // "owner" IS REFUSED HERE DELIBERATELY. A suggestion is by
    // definition something the owner has not said; storing one as
    // `owner` would launder a guess into his own words.
    return { ok: false, why: `source must be one of ${SUGGESTION_SOURCES.join(", ")}` };
  }

  const kind = String(suggestion?.evidence?.sourceKind ?? "").trim();
  if (!kind) return { ok: false, why: "evidence must say what kind of source it came from" };

  const quote = String(suggestion?.evidence?.quote ?? "").trim();
  if (suggestion.source === "discovered" && !quote) {
    // A DISCOVERY WITHOUT ITS SENTENCE IS AN INFERENCE WEARING A
    // DISCOVERY'S NAME. The owner is told "your page says this" — so
    // there has to be a line of his page to show him.
    return { ok: false, why: "a discovery must carry the sentence it was read from" };
  }

  if (!acceptsSuggestion(existing)) {
    return { ok: false, why: `the owner has already dealt with this question (${String((existing as any)?.status)})` };
  }

  return {
    ok: true,
    row: {
      question_key: key,
      status: "suggested",
      source: suggestion.source,
      suggested_value: value.slice(0, SUGGESTION_CHARS),
      evidence: {
        sourceKind: kind,
        url: suggestion.evidence.url ?? null,
        quote: quote ? quote.slice(0, QUOTE_CHARS) : null,
      },
    },
  };
}

/** One pending suggestion, as the card and the WhatsApp message read it. */
export type PendingSuggestion = {
  questionKey: string;
  value: string;
  source: "discovered" | "inferred";
  evidence: Evidence | null;
};

/**
 * The suggestions waiting on the owner.
 *
 * A ROW WITH NO VALUE IS NOT ONE, however its status reads. Showing a
 * card that says "we think the answer is" and then nothing is worse
 * than not asking.
 */
export function pendingSuggestions(rows: ProgressRow[] | null | undefined): PendingSuggestion[] {
  const out: PendingSuggestion[] = [];
  for (const row of rows ?? []) {
    const r = row as any;
    if (String(r?.status ?? "").trim() !== "suggested") continue;
    const key = String(r?.question_key ?? "").trim();
    const value = String(r?.suggested_value ?? "").trim();
    if (!key || !value) continue;
    if (!isSuggestionSource(r?.source)) continue;
    out.push({
      questionKey: key,
      value,
      source: r.source,
      evidence: r?.evidence && typeof r.evidence === "object" ? (r.evidence as Evidence) : null,
    });
  }
  return out;
}

/**
 * Store a suggestion, if the question is still open to one.
 *
 * NEVER THROWS. Discovery runs over a whole interview at once; one
 * question failing to store is not a reason to abandon the rest, and
 * the caller gets a false it can count.
 */
export async function storeSuggestion(
  supabase: any,
  dealershipId: string,
  suggestion: Suggestion,
  existing?: ProgressRow | null
): Promise<boolean> {
  const prepared = prepareSuggestion(suggestion, existing);
  if (!prepared.ok) {
    console.error(`[suggestions] ${suggestion?.questionKey}: ${prepared.why}`);
    return false;
  }
  try {
    const { error } = await supabase.from("interview_answers").upsert(
      { dealership_id: dealershipId, ...prepared.row, updated_at: new Date().toISOString() },
      { onConflict: "dealership_id,question_key" }
    );
    if (error) {
      console.error(`[suggestions] could not store ${suggestion.questionKey}: ${error.message}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[suggestions] could not store ${suggestion.questionKey}: ${e?.message ?? e}`);
    return false;
  }
}

/**
 * The owner says a suggestion is wrong.
 *
 * THE VALUE IS CLEARED AND `source` IS KEPT. The question goes back to
 * being unanswered — but what we guessed, and that we guessed, stays
 * visible as a record of having been wrong. `rejected` is not
 * `skipped`: the owner has not declined the question, only our answer
 * to it, so the interview may still ask it properly.
 */
export async function rejectSuggestion(
  supabase: any,
  dealershipId: string,
  questionKey: string
): Promise<boolean> {
  const key = String(questionKey ?? "").trim();
  if (!key) return false;
  try {
    const { error } = await supabase
      .from("interview_answers")
      .update({ status: "rejected", suggested_value: null, updated_at: new Date().toISOString() })
      .eq("dealership_id", dealershipId)
      .eq("question_key", key)
      .eq("status", "suggested");
    if (error) {
      console.error(`[suggestions] could not reject ${key}: ${error.message}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[suggestions] could not reject ${key}: ${e?.message ?? e}`);
    return false;
  }
}
