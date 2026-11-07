// Judging an answer, without a person reading it (I3 of
// docs/PLAN-AUTO-INTERVIEW.md).
//
// THREE JOBS, and the first one is the one with an incident behind it.
//
// 1. LENGTH — SPLIT, NEVER TRUNCATE. A note is shown to a generator
//    through `businessFacts.ts`, which slices content to
//    KNOWLEDGE_NOTE_CHARS. That file records what truncation did:
//    content cut "mid-sentence, so '40 hours burn hota hai' could reach
//    the model as a number with no unit." A long answer therefore
//    becomes SEVERAL rows, each whole, rather than one row with its end
//    cut off — and the split prefers a sentence boundary, because a fact
//    broken in half is two wrong facts.
//
// 2. CATEGORY — a value the live CHECK accepts, and nothing else. The
//    policy table is code and moves faster than migrations; this is the
//    test that catches a mismatch rather than a failed insert at the
//    worst possible moment.
//
// 3. VAGUENESS — the founder's requirement: a follow-up on an answer
//    that is only adjectives.
//
// WHY THE CLAIMS GUARD CANNOT DO JOB 3, which is the finding that sized
// this phase. `claimCheck` decides whether a claim is supported BY THE
// RECORDS. Here the answer IS the record — there is nothing behind it to
// check it against — so the guard would pass "we have the best quality
// in the city" without complaint, and it would be right to: those are
// the owner's own words about his own business. What is needed is
// smaller and different: does this answer contain anything a customer
// could check?
//
// AND THE DESIGN DECISION THAT MATTERS MOST HERE: THIS CHECK IS
// DELIBERATELY UNDER-EAGER.
//
// It cannot tell a specific noun from a vague one without a vocabulary,
// and a vocabulary of specific nouns would be one trade's words handed
// to every business — CLAUDE.md rule 3, and the leak this codebase has
// already had twice. So "Soy wax, not paraffin" and "we use only the
// finest ingredients" look the same to it: no digits, no units.
//
// Given that, it flags only the answer that is vague AND says so with a
// superlative. The asymmetry is chosen: a false "weak" means arguing
// with an owner about a good answer, and an owner who cannot get past a
// question abandons the interview — which §2.1 of the plan says is the
// expensive failure, because a half-filled record looks complete to a
// generator.
//
// THE FOUNDER'S DECISION OF 7 NOVEMBER, and it is the last word here: an
// answer that fails twice is STORED AND MARKED WEAK, never blocked.
// Refusing the owner's own words is worse than recording them with a
// flag the generators can read.
//
// Pure: no I/O, no model, no React. Deterministic — the same answer
// judged twice gives the same verdict, which a model pass could not
// promise and which is why decision 3 was "deterministic only".

import { KNOWLEDGE_NOTE_CHARS, isKnowledgeCategory } from "@/lib/knowledge/noteShape";
import type { InterviewQuestion } from "./interview";

/** One row as it will be written to `business_knowledge`. */
export type KnowledgeRow = { category: string; title: string; content: string };

export type AnswerVerdict = {
  /** Whether this answer may be written now. */
  store: boolean;
  /** Whether it goes in flagged as thin, for the generators to read. */
  weak: boolean;
  /** What to ask back, once, or null. */
  followUp: string | null;
  /** The rows to write, empty when `store` is false. */
  rows: KnowledgeRow[];
  /** Why, in the product's own words. Null when there is nothing to say. */
  reason: string | null;
};

/**
 * Words that sound like an answer and are not one.
 *
 * INDUSTRY-NEUTRAL BY CONSTRUCTION, and rule 3 means it has to be: not
 * one of these names a trade, a product or a material. They are the
 * words any business reaches for when it has not thought of the fact
 * yet — which is the whole point. "Best" is the one the founder named.
 */
const VAGUE = [
  "best", "finest", "greatest", "top", "topmost", "number one", "no. 1", "no.1",
  "premium", "luxury", "luxurious", "high quality", "high-quality", "top quality",
  "superior", "unmatched", "unbeatable", "world class", "world-class",
  "amazing", "awesome", "excellent", "outstanding", "exceptional", "perfect",
  "great quality", "good quality", "better quality", "very good", "the very best",
  "trusted", "reliable", "genuine quality", "authentic quality",
  "affordable prices", "reasonable prices", "best prices", "lowest prices",
  "customer satisfaction", "customer first", "quality service", "best service",
  "leading", "renowned", "famous", "popular choice", "most popular",
] as const;

/**
 * Units a customer can hold a business to.
 *
 * ALSO INDUSTRY-NEUTRAL: a rupee, a percentage, a day and a kilogram
 * mean the same thing to a sweet shop and a coaching centre. Nothing
 * here names what is being measured.
 */
const UNITS =
  /(?:₹|rs\.?|inr|%|\bper\s?cent\b|\bkm\b|\bkms\b|\bkg\b|\bkgs\b|\bgms?\b|\bgrams?\b|\bml\b|\blitres?\b|\bliters?\b|\bmins?\b|\bminutes?\b|\bhrs?\b|\bhours?\b|\bdays?\b|\bweeks?\b|\bmonths?\b|\byears?\b|\bpieces?\b|\bpcs?\b)/i;

/** A digit anywhere — the plainest checkable thing there is. */
const DIGIT = /\d/;

/**
 * Whether there is anything here a customer could check.
 *
 * A DIGIT OR A UNIT, and nothing cleverer. "2-3 days" passes. "40 hours"
 * passes. "₹650 upwards" passes. "We are the best" does not.
 */
export function hasCheckableDetail(text: string): boolean {
  const t = String(text ?? "");
  return DIGIT.test(t) || UNITS.test(t);
}

/** The vague words this answer actually used, in the order they appear. */
export function vagueWordsIn(text: string): string[] {
  const t = ` ${String(text ?? "").toLowerCase().replace(/\s+/g, " ")} `;
  const found: { word: string; at: number }[] = [];
  for (const word of VAGUE) {
    const at = t.indexOf(` ${word}`);
    if (at !== -1) found.push({ word, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.word);
}

/**
 * Whether this answer is only praise.
 *
 * BOTH CONDITIONS, deliberately: nothing checkable AND a superlative to
 * show that the owner was reaching for one. An answer with neither — a
 * plain specific sentence this check cannot recognise as specific — is
 * left alone, because being wrong in that direction costs an abandoned
 * interview.
 */
export function isVague(text: string): boolean {
  // AN EMPTY ANSWER FALLS OUT OF THE `&&` ON ITS OWN: it has no vague
  // words, so the second half is false. An early `if (!t) return false`
  // used to sit here and a mutation check found that removing it
  // changed nothing — redundant code cannot be guarded, so the one
  // condition keeps the job. An absent answer is handled by
  // judgeAnswer, which is where the difference between "nothing was
  // written" and "the answer is nothing" matters.
  const t = String(text ?? "").trim();
  return !hasCheckableDetail(t) && vagueWordsIn(t).length > 0;
}

/**
 * What to ask back. Once.
 *
 * NAMES THE WORD, because "be more specific" is not a question anybody
 * can answer. It quotes what the owner wrote and asks for the number
 * behind it.
 */
export function followUpFor(text: string): string {
  const words = vagueWordsIn(text);
  const quoted = words.length ? `"${words[0]}"` : "that";
  return `${quoted} is not something a customer can check before they buy. What is the number, the material or the time behind it? If there isn't one, say so and we'll leave it out.`;
}

/** One line of whitespace-normalised text. A note is read, not laid out. */
function tidy(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The answer as whole rows, each inside the length a generator is shown.
 *
 * SENTENCE BOUNDARIES FIRST. `businessFacts.ts` records what cutting
 * mid-sentence did: "40 hours burn hota hai" reaching a model as a
 * number with no unit. A fact split in half is two wrong facts, so a
 * sentence is kept together wherever it fits.
 *
 * A WORD BOUNDARY IS THE FALLBACK, for the single sentence longer than
 * the limit. It is the least-bad option and it is still never mid-word:
 * a number cut in half is worse than a sentence cut in half.
 *
 * NOTHING IS DROPPED. A long answer becomes four rows rather than one
 * truncated row, and `rowsForPrompt` already says out loud how many rows
 * did not fit in a prompt — so the owner's words are either shown or
 * declared missing, never silently halved.
 */
export function splitToNotes(text: string, limit: number = KNOWLEDGE_NOTE_CHARS): string[] {
  const t = tidy(text);
  if (!t) return [];
  if (t.length <= limit) return [t];

  // Sentences, with their terminator kept — a note ending in a bare
  // clause reads as an unfinished thought.
  const sentences = t.match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];
  const out: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      // One sentence that cannot fit. Flush what is held, then break
      // this one on word boundaries.
      flush();
      let rest = sentence;
      while (rest.length > limit) {
        let cut = rest.lastIndexOf(" ", limit);
        // A single "word" longer than the limit — a pasted URL, say.
        // Cutting it is the only option left, and it is declared rather
        // than hidden by the caller's `splitAtWordBoundary: false`.
        if (cut <= 0) cut = limit;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) current = rest;
      continue;
    }
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length > limit) {
      flush();
      current = sentence;
    } else {
      current = joined;
    }
  }
  flush();
  return out.filter(Boolean);
}

/**
 * The rows for one answer, titled so a re-answer updates rather than
 * duplicates.
 *
 * THE FIRST ROW KEEPS THE REGISTRY'S TITLE and later rows are numbered
 * from it. The registry's titles are unique and stable (a test holds
 * it), so "Delivery time" and "Delivery time (2)" are the same two rows
 * every time the question is answered — which is what makes a re-answer
 * an update instead of a third copy.
 */
export function rowsForAnswer(question: InterviewQuestion, text: string): KnowledgeRow[] {
  if (question.writesTo.table !== "business_knowledge") return [];
  const { category, title } = question.writesTo;
  return splitToNotes(text).map((content, i) => ({
    category,
    title: i === 0 ? title : `${title} (${i + 1})`,
    content,
  }));
}

/**
 * The verdict on one answer.
 *
 * `attempt` is 1 for the first answer to a question and 2 for the answer
 * to the follow-up. A SECOND WEAK ANSWER IS STORED AND FLAGGED — the
 * founder's decision of 7 November, and the reason is in this file's
 * header: refusing the owner's own words is worse than recording them
 * with a flag.
 */
export function judgeAnswer(
  question: InterviewQuestion,
  text: string,
  opts: { attempt?: number } = {}
): AnswerVerdict {
  const attempt = opts.attempt ?? 1;
  const tidied = tidy(text);

  // AN EMPTY ANSWER IS NOT A WEAK ANSWER, it is no answer. Storing an
  // empty note would make "nobody answered" look like "the answer is
  // nothing", which are different facts.
  if (!tidied) {
    return { store: false, weak: false, followUp: null, rows: [], reason: "nothing was written" };
  }

  // A CATEGORY THE DATABASE WOULD REFUSE IS A BUG, NOT THE OWNER'S
  // PROBLEM. It is refused here, loudly, rather than at the insert.
  if (question.writesTo.table === "business_knowledge" && !isKnowledgeCategory(question.writesTo.category)) {
    return {
      store: false,
      weak: false,
      followUp: null,
      rows: [],
      reason: `the question "${question.key}" is filed under a category the database does not allow`,
    };
  }

  const rows = rowsForAnswer(question, tidied);

  if (question.needsFalsifiable && isVague(tidied)) {
    if (attempt < 2) {
      // ASK ONCE. Not twice, not every week.
      return { store: false, weak: true, followUp: followUpFor(tidied), rows: [], reason: "nothing in it can be checked" };
    }
    return {
      store: true,
      weak: true,
      followUp: null,
      rows,
      reason: "stored as the owner wrote it, flagged as thin — nothing in it can be checked",
    };
  }

  return { store: true, weak: false, followUp: null, rows, reason: null };
}
