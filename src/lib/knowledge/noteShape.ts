// What a recorded note may be, in one place.
//
// THE CATEGORIES AND THE LENGTH, and three files need both: the
// interview's question registry declares where each answer is filed
// (lib/onboarding/interview.ts), the answer validator splits an answer
// to fit (lib/onboarding/answerCheck.ts), and the facts layer slices
// each row before a model sees it (lib/claims/businessFacts.ts).
//
// WHY ONE MODULE RATHER THAN THREE COPIES OF `200`. The number is not a
// style choice — it is the point at which a fact stops being a fact. The
// incident is recorded in businessFacts.ts: content cut at
// `slice(0, 200)` mid-sentence meant "40 hours burn hota hai" could
// reach the model as a number with no unit. A validator that splits at
// 200 while the reader slices at 180 would reintroduce exactly that,
// quietly, and nothing would fail.
//
// PURE ON PURPOSE. The validator and the registry are read by a client
// component; businessFacts.ts pulls in the whole facts layer. Nothing is
// imported here, so one definition costs no bundle — the same reasoning
// lib/pages/provenance.ts and lib/claims/offerPromises.ts give for
// theirs.

/**
 * The six the live CHECK on `business_knowledge.category` accepts.
 *
 * Migration 189 widened migration 118's five. A seventh value fails the
 * insert, so this list is the one thing allowed to decide what a
 * category may be.
 */
export const KNOWLEDGE_CATEGORIES = ["hours", "pricing_note", "policy", "faq", "general", "business_story"] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/**
 * How much of one note a generator is shown.
 *
 * READ BY businessFacts.ts AS WELL AS WRITTEN BY answerCheck.ts, which
 * is the whole reason this constant exists rather than two literals.
 */
export const KNOWLEDGE_NOTE_CHARS = 200;

/**
 * How many notes a generator is shown.
 *
 * Not enforced here — `rowsForPrompt` applies it, and says out loud how
 * many rows did not fit ("N more recorded note(s) did not fit here. Do
 * not guess what they say."), which is why a long answer splitting into
 * several rows is safe rather than silently lost.
 */
export const KNOWLEDGE_NOTES_SHOWN = 12;

/** Whether this is a category the database will accept. */
export function isKnowledgeCategory(value: unknown): value is KnowledgeCategory {
  return typeof value === "string" && (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value);
}
