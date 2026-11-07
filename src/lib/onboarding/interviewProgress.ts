// How much of the interview is answered, and saying so out loud.
//
// I5 of docs/PLAN-AUTO-INTERVIEW.md, and the reason it exists is §2.1 of
// that plan rather than anything about progress bars:
//
//   A HALF-FILLED RECORD LOOKS COMPLETE TO A GENERATOR. `knownText`
//   reads what is in business_knowledge and has no way to know what the
//   owner never reached. Six answers out of nine, abandoned, are read
//   as the whole truth about a business — and the gaps are exactly where
//   a model invents, because that is what a model does with a gap.
//
// So the count is not decoration. It is a fact the facts layer states,
// in the same breath as the notes themselves, with the instruction that
// the gaps are not to be filled in.
//
// THE SAME SHAPE THE REST OF THIS FILE'S NEIGHBOURS ALREADY USE:
// `rowsForPrompt` says "N more recorded note(s) did not fit here. Do not
// guess what they say." `withheldNote` says a story exists and is
// off-limits and not to be substituted. This is the third of those, for
// the questions nobody has answered — and all three exist because a
// model that cannot see something will invent its own version to fill
// the gap.
//
// Pure: no I/O, no model, no React.

import { questionsFor, type InterviewContext } from "./interview";
import type { BusinessModel } from "@/lib/business/businessModel";

/** One row of `interview_answers`, as far as this file cares. */
export type ProgressRow = {
  question_key?: string | null;
  status?: string | null;
  attempts?: number | null;
  weak?: boolean | null;
};

export type InterviewProgress = {
  /** Keys the owner has actually answered. */
  answered: string[];
  /** Keys the owner declined. Not answers, and not asked again. */
  skipped: string[];
  /** Keys Tier 3 has raised and is waiting on. */
  asked: string[];
  /** Keys whose stored answer is thin. */
  weak: string[];
};

export const EMPTY_PROGRESS: InterviewProgress = { answered: [], skipped: [], asked: [], weak: [] };

/**
 * The rows, sorted into what they mean.
 *
 * A STATUS THIS FILE DOES NOT RECOGNISE IS COUNTED AS NOTHING. The
 * column has no CHECK constraint on purpose (the questions are code),
 * so an unknown value is a row written by something newer than this
 * reader — and treating it as "answered" would make the facts layer
 * report a question as done when nobody knows that it is.
 */
export function readProgress(rows: ProgressRow[] | null | undefined): InterviewProgress {
  const out: InterviewProgress = { answered: [], skipped: [], asked: [], weak: [] };
  for (const row of rows ?? []) {
    const key = String(row?.question_key ?? "").trim();
    if (!key) continue;
    if (row?.weak === true) out.weak.push(key);
    const status = String(row?.status ?? "").trim();
    if (status === "answered") out.answered.push(key);
    else if (status === "skipped") out.skipped.push(key);
    else if (status === "asked") out.asked.push(key);
  }
  return out;
}

/**
 * How many attempts this question has had, for `judgeAnswer`.
 *
 * ONE FOR A QUESTION NOBODY HAS ANSWERED, because the answer about to be
 * judged is the first one. A zero here would make the follow-up rule
 * read `attempt < 2` on an attempt that has not happened.
 */
export function attemptFor(rows: ProgressRow[] | null | undefined, key: string): number {
  const row = (rows ?? []).find((r) => String(r?.question_key ?? "") === key);
  const attempts = Number(row?.attempts ?? 0);
  return Number.isFinite(attempts) && attempts > 0 ? attempts + 1 : 1;
}

/**
 * The context the question registry wants.
 *
 * SKIPPED COUNTS AS DEALT WITH, not as answered. The interview must not
 * put a declined question back in front of the owner — the founder's
 * decision of 7 November was that a fact is asked for once, ever — while
 * the facts layer must not count it as a fact that exists.
 */
export function contextFrom(progress: InterviewProgress, models: BusinessModel[] = []): InterviewContext {
  return { models, answered: [...progress.answered, ...progress.skipped] };
}

/**
 * What the facts layer says about the gaps.
 *
 * Returns null when there is nothing to say — a business that has
 * answered everything needs no disclosure, and one that has answered
 * nothing has no notes for a generator to over-read in the first place.
 *
 * THE WORDING IS AN INSTRUCTION, not a statistic. "4 of 9" on its own
 * invites a model to be helpful about the other five.
 */
export function unansweredNote(progress: InterviewProgress, models: BusinessModel[] = []): string | null {
  // COUNTED FROM `answered` ALONE, NOT FROM contextFrom().
  //
  // THE BUG THIS COMMENT IS HERE TO STOP COMING BACK: contextFrom
  // merges skipped into answered so the INTERVIEW stops re-asking a
  // declined question. Counting progress through it meant a business
  // that SKIPPED eight of nine questions got no disclosure at all — the
  // facts layer read it as fully answered, which is exactly the failure
  // this function exists to prevent, arriving through the fix for a
  // different one.
  //
  // Two different questions, two different reads:
  //   "what do I ask next?"    answered + skipped  (contextFrom)
  //   "how much is on record?" answered only       (here)
  const asked = questionsFor(2, { models });
  if (asked.length === 0) return null;
  const total = asked.length;
  const answered = asked.filter((q) => progress.answered.includes(q.key)).length;
  if (answered === 0) return null;
  if (answered >= total) return null;
  const missing = total - answered;
  return `The owner has answered ${answered} of ${total} questions about how this business works. ${missing} ${
    missing === 1 ? "is" : "are"
  } unanswered, so what is recorded above is NOT the whole picture — do not fill the gaps in, and do not imply the business has no answer.`;
}

/**
 * What the facts layer says about a thin answer.
 *
 * A note the owner wrote twice without anything checkable in it is still
 * the owner's own words and is still shown — refusing it was the option
 * the founder decided against. What changes is that it is not handed
 * over as a fact.
 */
export function weakNoteWarning(count: number): string | null {
  if (count <= 0) return null;
  return `${count} of the notes above ${
    count === 1 ? "is" : "are"
  } marked thin: the owner wrote it, nothing in it can be checked, and it must not be repeated as a fact or turned into a claim.`;
}
