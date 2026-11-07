// A half-finished interview that says it is half-finished (I5 of
// docs/PLAN-AUTO-INTERVIEW.md).
//
// THE FAILURE EVERY SECTION BELOW IS ABOUT, and it is §2.1 of that
// plan rather than anything about progress bars:
//
//   A HALF-FILLED RECORD LOOKS COMPLETE TO A GENERATOR. `knownText`
//   reads what is in business_knowledge and has no way to know what the
//   owner never reached. Six answers out of nine, abandoned, are read
//   as the whole truth about a business — and the gaps are exactly
//   where a model invents, because that is what a model does with a
//   gap.
//
// So the count is not decoration: it is a sentence the facts layer
// states, in the same breath as the notes, with the instruction that
// the gaps are not to be filled in. It joins the two disclosures that
// already exist for the same reason — `rowsForPrompt` saying how many
// notes did not fit, and `withheldNote` saying a story exists and is
// off-limits and not to be substituted.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { code, sql } from "./helpers/source";

import {
  EMPTY_PROGRESS,
  attemptFor,
  contextFrom,
  readProgress,
  unansweredNote,
  weakNoteWarning,
} from "@/lib/onboarding/interviewProgress";
import { questionsFor } from "@/lib/onboarding/interview";
import { rowsForPrompt } from "@/lib/content/storyRows";

const PRODUCTS = ["products"] as any;

/** How many times this appears — presence is not enough when it occurs twice. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}


// ---------------------------------------------------------------------
describe("1. THE ROWS ARE SORTED INTO WHAT THEY MEAN", () => {
  it("ANSWERED, SKIPPED AND ASKED ARE THREE DIFFERENT THINGS", () => {
    const p = readProgress([
      { question_key: "delivery_time", status: "answered" },
      { question_key: "returns_policy", status: "skipped" },
      { question_key: "why_not_cheaper", status: "asked" },
    ]);
    expect(p.answered).toEqual(["delivery_time"]);
    expect(p.skipped).toEqual(["returns_policy"]);
    expect(p.asked).toEqual(["why_not_cheaper"]);
  });

  it("A STATUS THIS READER DOES NOT KNOW IS COUNTED AS NOTHING", () => {
    // The column has no CHECK on purpose (the questions are code), so an
    // unknown value is a row written by something newer. Treating it as
    // "answered" would report a question as done when nobody knows it
    // is — and the facts layer would then under-state the gaps.
    const p = readProgress([{ question_key: "delivery_time", status: "pondering" }]);
    expect(p.answered).toEqual([]);
    expect(p.skipped).toEqual([]);
    expect(p.asked).toEqual([]);
  });

  it("A ROW WITH NO KEY IS IGNORED", () => {
    expect(readProgress([{ question_key: "  ", status: "answered" }]).answered).toEqual([]);
    expect(readProgress([{ status: "answered" }]).answered).toEqual([]);
  });

  it("THE THIN FLAG IS STRICTLY true", () => {
    expect(readProgress([{ question_key: "a", status: "answered", weak: true }]).weak).toEqual(["a"]);
    for (const value of [false, null, undefined, "true", 1]) {
      expect(readProgress([{ question_key: "a", status: "answered", weak: value as any }]).weak).toEqual([]);
    }
  });

  it("and no rows is no progress, not an error", () => {
    expect(readProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(readProgress(undefined)).toEqual(EMPTY_PROGRESS);
    expect(readProgress([])).toEqual(EMPTY_PROGRESS);
  });
});

// ---------------------------------------------------------------------
describe("2. SKIPPED IS DEALT WITH, NOT ANSWERED", () => {
  it("A SKIPPED QUESTION IS NOT PUT BACK IN FRONT OF THE OWNER", () => {
    // The founder's decision of 7 November: a fact is asked for once,
    // ever. A product that re-asks is one the owner stops reading.
    const p = readProgress([{ question_key: "returns_policy", status: "skipped" }]);
    expect(contextFrom(p, PRODUCTS).answered).toContain("returns_policy");
  });

  it("AND IT IS NOT COUNTED AS A FACT THAT EXISTS", () => {
    // Both halves matter and they pull in opposite directions: the
    // interview must stop asking, and the facts layer must not believe
    // there is an answer.
    const p = readProgress([{ question_key: "returns_policy", status: "skipped" }]);
    expect(p.answered).not.toContain("returns_policy");
    expect(p.skipped).toContain("returns_policy");
  });
});

// ---------------------------------------------------------------------
describe("3. THE ATTEMPT COUNT IS WHAT DECIDES THE FOLLOW-UP", () => {
  it("A QUESTION NOBODY HAS ANSWERED IS ON ITS FIRST ATTEMPT", () => {
    // A zero here would make judgeAnswer's `attempt < 2` fire on an
    // attempt that has not happened.
    expect(attemptFor([], "delivery_time")).toBe(1);
    expect(attemptFor(null, "delivery_time")).toBe(1);
  });

  it("AND ONE ALREADY ANSWERED ONCE IS ON ITS SECOND", () => {
    expect(attemptFor([{ question_key: "delivery_time", attempts: 1 }], "delivery_time")).toBe(2);
    expect(attemptFor([{ question_key: "delivery_time", attempts: 3 }], "delivery_time")).toBe(4);
  });

  it("a nonsense attempts value reads as the first attempt, not as the last", () => {
    for (const value of [0, -2, null, "two"]) {
      expect(attemptFor([{ question_key: "a", attempts: value as any }], "a")).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------
describe("4. THE GAPS ARE STATED AS AN INSTRUCTION, NOT A STATISTIC", () => {
  const someAnswered = readProgress(
    questionsFor(2, { models: PRODUCTS })
      .slice(0, 3)
      .map((q) => ({ question_key: q.key, status: "answered" }))
  );

  it("IT SAYS HOW MANY, AND THAT THE GAPS ARE NOT TO BE FILLED", () => {
    const note = unansweredNote(someAnswered, PRODUCTS)!;
    expect(note).toMatch(/has answered 3 of \d+ questions/);
    expect(note).toMatch(/NOT the whole picture/);
    expect(note).toMatch(/do not fill the gaps in/i);
  });

  it("AND THAT THE BUSINESS MUST NOT BE IMPLIED TO HAVE NO ANSWER", () => {
    // The other way a model fills a gap: "they don't offer that".
    expect(unansweredNote(someAnswered, PRODUCTS)!).toMatch(/do not imply the business has no answer/i);
  });

  it("NOTHING IS SAID WHEN NOTHING IS ANSWERED", () => {
    // There are no notes for a generator to over-read, so the sentence
    // would be noise — and the facts layer already says the records are
    // empty.
    expect(unansweredNote(EMPTY_PROGRESS, PRODUCTS)).toBeNull();
  });

  it("AND NOTHING IS SAID WHEN EVERYTHING IS ANSWERED", () => {
    const all = readProgress(questionsFor(2, { models: PRODUCTS }).map((q) => ({ question_key: q.key, status: "answered" })));
    expect(unansweredNote(all, PRODUCTS)).toBeNull();
  });

  it("A SKIPPED QUESTION DOES NOT COUNT TOWARDS THE ANSWERED TOTAL", () => {
    const skipped = readProgress(
      questionsFor(2, { models: PRODUCTS }).map((q, i) => ({ question_key: q.key, status: i === 0 ? "answered" : "skipped" }))
    );
    const note = unansweredNote(skipped, PRODUCTS);
    // One answered, the rest declined: still not the whole picture.
    expect(note).toMatch(/has answered 1 of \d+ questions/);
  });

  it("the singular reads as a sentence, not as '1 are unanswered'", () => {
    const all = questionsFor(2, { models: PRODUCTS });
    const allButOne = readProgress(all.slice(0, -1).map((q) => ({ question_key: q.key, status: "answered" })));
    expect(unansweredNote(allButOne, PRODUCTS)!).toMatch(/1 is unanswered/);
  });
});

// ---------------------------------------------------------------------
describe("5. A THIN NOTE IS MARKED WHERE IT IS SHOWN", () => {
  it("THE WARNING NAMES HOW MANY, AND FORBIDS REPEATING THEM AS FACT", () => {
    expect(weakNoteWarning(2)!).toMatch(/2 of the notes above are marked thin/);
    expect(weakNoteWarning(2)!).toMatch(/must not be repeated as a fact or turned into a claim/);
    expect(weakNoteWarning(1)!).toMatch(/1 of the notes above is marked thin/);
  });

  it("AND THERE IS NO WARNING WHEN NOTHING IS THIN", () => {
    expect(weakNoteWarning(0)).toBeNull();
    expect(weakNoteWarning(-1)).toBeNull();
  });

  it("THE MARK IS ON THE LINE ITSELF, not three lines below it", () => {
    // A warning three lines below a sentence is a warning about some
    // other sentence as far as a model is concerned.
    const facts = code("src/lib/claims/businessFacts.ts");
    expect(facts).toMatch(/k\.weak \? " \(THIN/);
  });

  it("THE FLAG TRAVELS THROUGH THE ROW RESHAPER", () => {
    // rowsForPrompt rebuilds every row, so a flag that qualifies content
    // has to be carried or it is silently lost — and a thin answer
    // handed over as an ordinary fact is the one outcome storing it was
    // meant to avoid.
    const out = rowsForPrompt([
      { category: "faq", title: "Why us", content: "We are the best.", weak: true },
      { category: "policy", title: "Delivery", content: "Two days." },
    ]);
    expect(out.rows[0]).toMatchObject({ title: "Why us", weak: true });
    expect(out.rows[1]).toMatchObject({ title: "Delivery", weak: false });
  });

  it("and the facts layer asks the database for the flag — in BOTH reads", () => {
    // FOUND BY A MUTATION. business_knowledge is read in two places in
    // that file, and a `toMatch` was satisfied by either one — so
    // dropping the column from one read left the assertion green and
    // the flag missing from half the callers.
    const facts = code("src/lib/claims/businessFacts.ts");
    const withFlag = occurrences(facts, 'select("category, title, content, public_use_consent, is_weak")');
    const withoutFlag = occurrences(facts, 'select("category, title, content, public_use_consent")');
    expect(withFlag).toBe(2);
    // The flagless spelling ends in `")`, so it is not a substring of the
    // flagged one — it must not appear at all.
    expect(withoutFlag).toBe(0);
    expect(facts).toMatch(/weak: k\.is_weak === true/);
  });
});

// ---------------------------------------------------------------------
describe("6. THE FACTS LAYER READS THE PROGRESS AND SAYS IT", () => {
  const facts = code("src/lib/claims/businessFacts.ts");

  it("THE PROGRESS IS READ BESIDE THE OTHER FACTS", () => {
    expect(facts).toMatch(/from\("interview_answers"\)\.select\("question_key, status, attempts, weak"\)/);
    expect(facts).toMatch(/interview: readProgress\(/);
  });

  it("AND THE GAP SENTENCE IS PUSHED INTO THE PROMPT", () => {
    expect(facts).toMatch(/const gaps = unansweredNote\(/);
    expect(facts).toMatch(/if \(gaps\) lines\.push\(gaps\)/);
  });

  it("IT IS STATED IN THE SAME BREATH AS THE NOTES, not at the end", () => {
    // Order matters for the same reason the inline mark does.
    const notesAt = facts.indexOf("What the owner says about the business:");
    const gapsAt = facts.indexOf("const gaps = unansweredNote(");
    const descriptionAt = facts.indexOf("How the owner describes the business:");
    expect(notesAt).toBeGreaterThan(-1);
    expect(gapsAt).toBeGreaterThan(notesAt);
    expect(gapsAt).toBeLessThan(descriptionAt);
  });

  it("and a business with no progress rows still formats", () => {
    expect(unansweredNote(EMPTY_PROGRESS)).toBeNull();
    expect(contextFrom(EMPTY_PROGRESS).answered).toEqual([]);
  });
});

// ---------------------------------------------------------------------
describe("7. THE ROUTE JUDGES, WRITES, AND RECORDS — in that order", () => {
  const route = code("src/app/api/interview/route.ts");
  const POST = route.slice(route.indexOf("export async function POST"));
  const GET = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));

  it("THIS IS THE FIRST CALLER OF judgeAnswer", () => {
    // I3 built the verdict and said plainly that nothing called it.
    expect(POST).toMatch(/const verdict = judgeAnswer\(question, text, \{ attempt \}\)/);
    expect(POST).toMatch(/const attempt = attemptFor\(rows, key\)/);
  });

  it("A KEY NOBODY DECLARED IS REFUSED, not guessed at", () => {
    expect(POST).toMatch(/if \(!question\) return NextResponse\.json\(\{ error: "Unknown question" \}, \{ status: 400 \}\)/);
  });

  it("AN ANSWER THAT IS NOT STORED STILL COUNTS ITS ATTEMPT", () => {
    // Otherwise the follow-up is asked forever, and the founder's rule
    // is that it is asked once.
    expect(POST).toMatch(/if \(!verdict\.store\)/);
    expect(POST).toMatch(/status: "asked", attempts: attempt/);
  });

  it("SKIPPING IS RECORDED AS SKIPPED, never as an answer", () => {
    expect(POST).toMatch(/status: "skipped"/);
    expect(POST).not.toMatch(/skip.*status: "answered"/);
  });

  it("THE THIN FLAG IS WRITTEN WITH THE TEXT AND WITH THE PROGRESS", () => {
    // FOUND BY A MUTATION. `weak: verdict.weak` is a SUBSTRING of
    // `is_weak: verdict.weak`, so the second assertion was satisfied by
    // the first line — and writing `weak: false` into the progress row
    // survived a test whose name says it checks both.
    //
    // Two writes, two assertions, counted: the note carries the flag and
    // so does the progress row, because a question whose answer is a
    // COLUMN has no note to carry it.
    expect(occurrences(POST, "is_weak: verdict.weak")).toBe(1);
    expect(occurrences(POST, "verdict.weak")).toBe(3); // is_weak, progress weak, and the response
    expect(POST).toMatch(/\n      weak: verdict\.weak,/);
  });

  it("IT IS A READ-THEN-WRITE, because the table has no unique index on title", () => {
    // business_knowledge is the owner's own, hand-editable through the
    // Business Knowledge page. An ON CONFLICT on (dealership_id, title)
    // fails at runtime without an index, and adding one to user-entered
    // text could fail against existing rows and later reject a
    // reasonable edit.
    expect(POST).toMatch(/\.eq\("title", row\.title\)/);
    expect(POST).toMatch(/existing\s*\n?\s*\? await service\.from\("business_knowledge"\)\.update/);
    expect(POST).not.toMatch(/onConflict: "dealership_id,title"/);
  });

  it("THE BUSINESS COMES FROM THE SESSION IN BOTH HANDLERS, never from the body", () => {
    // GET reads it inline; POST goes through the shared `resolve`
    // helper, so the assertion follows the structure rather than
    // assuming both handlers repeat the query.
    const RESOLVE = route.slice(route.indexOf("async function resolve"), route.indexOf("export async function GET"));
    for (const handler of [GET, RESOLVE]) {
      expect(handler).toMatch(/from\("profiles"\)\.select\("dealership_id"\)\.eq\("id", user\.id\)/);
      expect(handler).toMatch(/if \(!user\)/);
    }
    expect(POST).toMatch(/const resolved = await resolve\(request\)/);
    expect(POST).toMatch(/if \("error" in resolved\) return resolved\.error/);
    expect(route).not.toMatch(/body.*dealership_id/);
  });

  it("AND THE READS GO THROUGH RLS IN THE HANDLER THAT ONLY READS", () => {
    expect(GET).not.toMatch(/createServiceClient/);
  });

  it("the question's own gate is not sent to the browser, from EITHER handler", () => {
    // `when` is a function; serialising it would send "undefined" and
    // invite the screen to decide what to ask.
    //
    // FOUND BY A MUTATION: both handlers return a question, so a single
    // `toMatch` was satisfied by whichever one was left intact.
    expect(occurrences(GET, "when: undefined")).toBe(1);
    expect(occurrences(POST, "when: undefined")).toBe(1);
  });
});

// ---------------------------------------------------------------------
describe("8. THE MIGRATION HOLDS STATUS, NOT CONTENT", () => {
  const m = sql("supabase/migrations/222_interview_progress.sql");

  it("THE FLAG IS ON business_knowledge, BESIDE THE TEXT IT QUALIFIES", () => {
    expect(m).toMatch(/alter table business_knowledge\s*\n\s*add column if not exists is_weak boolean not null default false/);
  });

  it("AND IT DEFAULTS false, so existing rows are not silently flagged", () => {
    expect(m).toMatch(/is_weak boolean not null default false/);
  });

  it("THE PROGRESS TABLE STORES NO ANSWER TEXT", () => {
    // A third home for the same sentence is how two copies of one fact
    // come to disagree.
    const table = m.slice(m.indexOf("create table if not exists interview_answers"), m.indexOf("create index"));
    expect(table).not.toMatch(/\bcontent\b/);
    expect(table).not.toMatch(/\banswer_text\b/);
    expect(table).toMatch(/question_key text not null/);
    expect(table).toMatch(/status text not null default 'answered'/);
  });

  it("ONE ROW PER QUESTION PER BUSINESS", () => {
    expect(m).toMatch(/unique \(dealership_id, question_key\)/);
  });

  it("RLS IS ON, BOTH READS ARE GRANTED, AND NOTHING WRITES FROM A CLIENT", () => {
    expect(m).toMatch(/alter table interview_answers enable row level security/);
    expect(m).toMatch(/create policy "interview_answers_owner_select"/);
    expect(m).toMatch(/create policy "interview_answers_member_select"/);
    expect(m).toMatch(/team_members where user_id = auth\.uid\(\) and status = 'active'/);
    const forInterview = m.slice(m.indexOf("alter table interview_answers enable row level security"));
    expect(forInterview).not.toMatch(/for (insert|update|delete)/i);
  });

  it("AND IT SHIPS ITS OWN VERIFY QUERIES", () => {
    // CLAUDE.md rule 4, asserted on the queries rather than on a word
    // that appears twice.
    const raw = readFileSync("supabase/migrations/222_interview_progress.sql", "utf8");
    expect(raw).toMatch(/where table_name = 'business_knowledge' and column_name = 'is_weak'/);
    expect(raw).toMatch(/from pg_class where relname = 'interview_answers'/);
    expect(raw).toMatch(/where tablename = 'interview_answers' order by polname/);
    expect(raw).toMatch(/contype = 'u'/);
  });
});

// ---------------------------------------------------------------------
describe("9. THE CARD WRITES NO PROMPT AND NO COUNT OF ITS OWN", () => {
  const ui = code("src/components/settings/InterviewCard.tsx");

  it("THE QUESTION COMES FROM THE ROUTE", () => {
    expect(ui).toMatch(/\{question\.prompt\}/);
    expect(ui).toMatch(/\{question\.help\}/);
    expect(ui).toMatch(/fetch\("\/api\/interview"\)/);
  });

  it("AND SO DOES THE COUNT, from the same source the prompt reads", () => {
    // A number typed into the screen could disagree with what the
    // generators are told.
    expect(ui).toMatch(/\{progress\.answered\} of \{progress\.total\} answered/);
    expect(ui).not.toMatch(/of 21 answered/);
  });

  it("LEAVING IS OFFERED, and it is recorded as skipped rather than as nothing", () => {
    expect(ui).toMatch(/send\(\{ skip: true \}\)/);
    expect(ui).toMatch(/I don't have an answer for this/);
  });

  it("AN EMPTY QUEUE SAYS SO rather than vanishing", () => {
    // A card that disappears looks like a card that broke.
    expect(ui).toMatch(/You've answered everything Hawlai asks/);
  });

  it("and a thin answer is reported back to the owner, not hidden", () => {
    expect(ui).toMatch(/Saved as you wrote it, marked as thin/);
  });
});
