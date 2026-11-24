// The answer, in the owner's own words or not at all — A6-b/A6-c.
//
// ──────────────────────────────────────────────────────────────────
// NOTHING IS GENERATED. THIS IS THE FINDING WORTH LEADING WITH.
//
// A3 and A6-c were both sized as "answers written from the business's
// own facts, through the C2 door" — a generator with a claims guard in
// front of it. Reading the interview showed that is not necessary: the
// answer to "what is your delivery time" is ALREADY STORED, as the
// sentence the owner typed, because `saveInterviewAnswer` writes it to
// `business_knowledge` under a stable title that the question itself
// carries in `writesTo`.
//
// So there is no generation, no model call, no cost, and no invented
// answer to guard against. An FAQ entry says what he said. The claims
// guard becomes a CHECK on his own wording rather than a gate on ours
// — and that is the difference between "the risk is managed" and "the
// risk is not present".
//
// WHEN THERE IS NO ANSWER, THE OUTPUT IS A QUESTION FOR HIM, never a
// page. A3's own note: "a short page of three true answers rather than
// a long one of twelve vague ones."
//
// ──────────────────────────────────────────────────────────────────
// TWO PERMISSIONS THAT ARE NOT THE SAME THING, and missing either one
// would put something public that nobody agreed to publish.
//
//   internalOnly   the answer is a COMPLIANCE declaration — "this
//                  business advertises housing" — which Meta needs and
//                  no customer should ever read back. Migration 229,
//                  and businessFacts honours it. Never an FAQ answer.
//   publishColumn  for `business_listing_facts`, the owner's SEPARATE
//                  decision about whether that value may appear on a
//                  public page. Knowing his phone number is not
//                  permission to print it.
//
// ──────────────────────────────────────────────────────────────────
// THE SHAPE IS ALWAYS AN FAQ ENTRY, and that is A6-b answered rather
// than dodged.
//
// The scope is FAQ entries and paragraphs on existing pages. A
// question and its answer IS the `faq_item` shape — `heading` and
// `html`, a pair in the data — which A2 built for exactly this, and
// which is what lets FAQPage schema be emitted at all. A paragraph is
// the same words with that fact thrown away.
//
// So no shape heuristic was written. Inventing one — "short questions
// become FAQ entries, topical ones become paragraphs" — would be a
// rule nobody could check against an outcome, deciding against the
// only structured option available.
// ──────────────────────────────────────────────────────────────────

import type { InterviewQuestion } from "@/lib/onboarding/interview";

export type KnowledgeRow = { title?: string | null; content?: string | null; is_weak?: boolean | null; is_active?: boolean | null };

export type DraftedAnswer =
  | {
      ok: true;
      /** The owner's own sentence. Never ours. */
      answer: string;
      /** His answer was thin when he gave it — worth saying before it goes public. */
      weak: boolean;
    }
  | { ok: false; why: string };

/** Shortest stored answer worth putting on a page. */
export const MIN_ANSWER = 15;

/**
 * The answer this business has already given, or why there is none.
 *
 * READ-ONLY AND MODEL-FREE. Every branch either returns something the
 * owner typed or says what he would have to say first.
 */
export function draftAnswer(
  question: InterviewQuestion,
  knowledge: KnowledgeRow[],
  listingFacts: Record<string, unknown> | null | undefined
): DraftedAnswer {
  const dest = question?.writesTo;
  if (!dest) return { ok: false, why: "nothing records an answer to this yet" };

  if (dest.table === "business_knowledge") {
    // COMPLIANCE ANSWERS NEVER BECOME PUBLIC COPY. Checked before the
    // row is even looked for, so a future reader cannot reorder this
    // and leak one.
    if (dest.internalOnly) return { ok: false, why: "this answer is a declaration for ad platforms, not something to publish" };

    const row = (knowledge ?? []).find(
      (r) => String(r?.title ?? "").trim().toLowerCase() === String(dest.title ?? "").trim().toLowerCase()
    );
    if (!row || row.is_active === false) return { ok: false, why: "you haven't told Hawlai this yet" };

    const text = String(row.content ?? "").replace(/\s+/g, " ").trim();
    if (text.length < MIN_ANSWER) return { ok: false, why: "what's on record is too short to answer with" };
    return { ok: true, answer: text, weak: row.is_weak === true };
  }

  // business_listing_facts — a value, and a separate permission.
  const value = String((listingFacts ?? {})[dest.column] ?? "").trim();
  if (!value) return { ok: false, why: "you haven't told Hawlai this yet" };

  // KNOWING IT IS NOT PERMISSION TO PRINT IT. `publish_phone` and its
  // siblings are the owner's own decision, made separately, and a
  // question answered in an FAQ is as public as a page gets.
  if (dest.publishColumn) {
    const allowed = (listingFacts ?? {})[dest.publishColumn];
    if (allowed !== true) return { ok: false, why: "you haven't said this may appear on a public page" };
  }

  if (value.length < MIN_ANSWER) return { ok: false, why: "what's on record is too short to answer with" };
  // A value the owner entered is never "weak" — thinness is a judgment
  // about prose, and a phone number is not vague.
  return { ok: true, answer: value, weak: false };
}

export type AnswerPlanRow = {
  question: string;
  /** The interview key, so a caller can act on the right row later. */
  key: string | null;
  draft: DraftedAnswer;
};

/**
 * Every candidate, with its answer or its reason.
 *
 * KEYED ON THE INTERVIEW QUESTION, so only candidates that came from
 * `answer_gaps` can be answered at all. A search term is a phrase
 * somebody typed into Google — there is no interview question behind
 * it and therefore no stored answer, and pretending otherwise is how a
 * generator would get invited back in.
 */
export function draftAnswers(
  candidates: { question: string; key?: string | null }[],
  questionFor: (key: string) => InterviewQuestion | null,
  knowledge: KnowledgeRow[],
  listingFacts: Record<string, unknown> | null | undefined
): AnswerPlanRow[] {
  return (candidates ?? []).map((c) => {
    const key = c?.key ? String(c.key) : null;
    const question = key ? questionFor(key) : null;
    if (!question) {
      return {
        question: String(c?.question ?? ""),
        key,
        draft: { ok: false, why: "this came from a search, so there is no recorded answer to draw on" } as DraftedAnswer,
      };
    }
    return { question: String(c?.question ?? ""), key, draft: draftAnswer(question, knowledge, listingFacts) };
  });
}

/**
 * How the drafting result reads in the daily email, appended to the
 * answer-gap line — or nothing when none of it can be answered.
 *
 * IT NAMES WHAT HE WOULD HAVE TO SAY, because "we cannot answer eight
 * of these" is a dead end and "tell Hawlai your delivery time and two
 * of them are answered" is a next step.
 */
export function draftSummary(rows: AnswerPlanRow[]): { text: string; numbers: { label: string; value: number; source: string }[] } | null {
  const list = rows ?? [];
  const ready = list.filter((r) => r.draft.ok);
  if (!ready.length) return null;

  const weak = ready.filter((r) => r.draft.ok && r.draft.weak).length;
  const numbers = [
    { label: "Answerable from what you have told Hawlai", value: ready.length, source: "business_knowledge" },
    ...(weak ? [{ label: "Of those, thin when you gave them", value: weak, source: "business_knowledge.is_weak" }] : []),
  ];

  // ONE SENTENCE FOR BOTH COUNTS, because "1 of them" and "3 of them"
  // read the same — a ternary here had two identical branches and a
  // test of mine asserted they differed, which was nonsense.
  const head = `${ready.length} of them can be answered in your own words, from what you have already told Hawlai`;
  const thin = weak
    ? weak === ready.length
      ? " — though every one of those answers was thin when you gave it, so it is worth a second look before it goes public"
      : ` — though ${weak} of those answers was thin when you gave it, so it is worth a second look before it goes public`
    : "";

  return { text: `${head}${thin}.`, numbers };
}
