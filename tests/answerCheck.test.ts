// Judging an answer without a person reading it (I3 of
// docs/PLAN-AUTO-INTERVIEW.md).
//
// THE INCIDENT BEHIND JOB 1, and it is already written down in
// businessFacts.ts: a note's content was cut at `slice(0, 200)`
// mid-sentence, "so '40 hours burn hota hai' could reach the model as a
// number with no unit." The validator's job is to make sure a long
// answer becomes several WHOLE notes rather than one note with its end
// missing — so this file's first section is about where a split lands.
//
// THE DESIGN DECISION THE REST OF THIS FILE PINS: the vagueness check is
// DELIBERATELY UNDER-EAGER. It cannot tell a specific noun from a vague
// one without a vocabulary, and a vocabulary of specific nouns would be
// one trade's words handed to every business — rule 3, and a leak this
// codebase has had twice. So it flags only an answer that is vague AND
// reaches for a superlative, and it leaves a plain specific sentence
// alone. Being wrong in the other direction costs an abandoned
// interview, which §2.1 of the plan says is the expensive failure.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";

import {
  followUpFor,
  hasCheckableDetail,
  isVague,
  judgeAnswer,
  rowsForAnswer,
  splitToNotes,
  vagueWordsIn,
} from "@/lib/onboarding/answerCheck";
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_NOTE_CHARS, KNOWLEDGE_NOTES_SHOWN } from "@/lib/knowledge/noteShape";
import { INTERVIEW_QUESTIONS, questionByKey } from "@/lib/onboarding/interview";

const why = questionByKey("why_not_cheaper")!;
const certs = questionByKey("certifications")!;
const phone = questionByKey("public_phone")!;

// ---------------------------------------------------------------------
describe("1. A LONG ANSWER IS SPLIT, NEVER TRUNCATED", () => {
  it("A SHORT ANSWER IS ONE NOTE, UNCHANGED", () => {
    expect(splitToNotes("Delivery takes 2 to 3 days.")).toEqual(["Delivery takes 2 to 3 days."]);
  });

  it("NOTHING IS LOST — every word of the answer is in some note", () => {
    const answer = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} says something that is worth about twenty words so that the whole answer is comfortably over the limit.`).join(" ");
    const notes = splitToNotes(answer);
    expect(notes.length).toBeGreaterThan(1);
    // Joined back, the same words in the same order.
    expect(notes.join(" ").replace(/\s+/g, " ")).toBe(answer.replace(/\s+/g, " "));
  });

  it("EVERY NOTE FITS INSIDE WHAT A GENERATOR IS SHOWN", () => {
    // TWO FIXTURES, BECAUSE THERE ARE TWO PATHS. The first is one giant
    // sentence, which goes through the word-boundary branch. The second
    // is many short sentences, which go through the accumulator — and a
    // mutation that let the accumulator run to twice the limit survived
    // the first fixture alone.
    const oneLongSentence = "A ".repeat(400) + "and it ends here.";
    const manyShortOnes = Array.from({ length: 40 }, (_, i) => `Fact number ${i + 1} is short.`).join(" ");
    for (const answer of [oneLongSentence, manyShortOnes]) {
      const notes = splitToNotes(answer);
      expect(notes.length).toBeGreaterThan(1);
      for (const note of notes) expect(note.length).toBeLessThanOrEqual(KNOWLEDGE_NOTE_CHARS);
    }
  });

  it("A SPLIT LANDS ON A SENTENCE BOUNDARY, because a fact in half is two wrong facts", () => {
    // The recorded incident: content cut mid-sentence meant "40 hours
    // burn hota hai" reached a model as a number with no unit.
    const a = "Delivery inside the city takes two days and we pack everything in a box with a paper wrap so that nothing moves around inside it during the journey.";
    const b = "Anywhere else in the country it takes 40 hours longer than that, and we send a tracking link on the same day the parcel leaves us.";
    const notes = splitToNotes(`${a} ${b}`);
    expect(notes).toEqual([a, b]);
    // The number and its unit stay together.
    expect(notes.some((n) => /40 hours/.test(n))).toBe(true);
  });

  it("AND NEVER MID-WORD, even when one sentence is too long for a note", () => {
    const long = `We ${"deliberately ".repeat(40)}do it that way.`;
    const notes = splitToNotes(long);
    expect(notes.length).toBeGreaterThan(1);
    for (const note of notes) {
      expect(note).not.toMatch(/\bdeliberatel$/);
      expect(note).not.toMatch(/^y\b/);
    }
    expect(notes.join(" ").replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " "));
  });

  it("a single unbreakable word longer than a note is cut rather than dropped", () => {
    // A pasted URL. Cutting it is the only option left; losing the
    // owner's answer is not one.
    const url = `https://example.com/${"x".repeat(300)}`;
    const notes = splitToNotes(url);
    expect(notes.length).toBeGreaterThan(1);
    expect(notes.join("")).toContain("x".repeat(100));
    // AND EVERY PIECE STILL FITS. Without this a mutation that gave up
    // on an unbreakable word and emitted it whole survived: the answer
    // was still "more than one note" and still contained the x's, but
    // one note was 300 characters and the facts layer would have cut it.
    for (const note of notes) expect(note.length).toBeLessThanOrEqual(KNOWLEDGE_NOTE_CHARS);
  });

  it("an empty answer is no notes, not one empty note", () => {
    expect(splitToNotes("")).toEqual([]);
    expect(splitToNotes("   \n  ")).toEqual([]);
  });

  it("THE LIMIT IS THE SAME NUMBER THE FACTS LAYER SLICES AT", () => {
    // A validator splitting at 200 while the reader sliced at 180 would
    // quietly reintroduce the mid-sentence cut, and nothing would fail.
    const facts = code("src/lib/claims/businessFacts.ts");
    expect(facts).toMatch(/slice\(0, KNOWLEDGE_NOTE_CHARS\)/);
    expect(facts).toMatch(/slice\(0, KNOWLEDGE_NOTES_SHOWN\)/);
    expect(facts).toMatch(/from "@\/lib\/knowledge\/noteShape"/);
    expect(KNOWLEDGE_NOTE_CHARS).toBe(200);
    expect(KNOWLEDGE_NOTES_SHOWN).toBe(12);
  });

  it("and no literal 200 or 12 is left in that slice", () => {
    const facts = code("src/lib/claims/businessFacts.ts");
    expect(facts).not.toMatch(/notes\.rows\.slice\(0, 12\)/);
    expect(facts).not.toMatch(/k\.content\.slice\(0, 200\)/);
  });
});

// ---------------------------------------------------------------------
describe("2. THE ROWS ARE TITLED SO A RE-ANSWER UPDATES", () => {
  it("THE FIRST ROW KEEPS THE REGISTRY'S TITLE", () => {
    const rows = rowsForAnswer(why, "We use 40 hours of something.");
    expect(rows).toEqual([{ category: "faq", title: "Why us and not cheaper", content: "We use 40 hours of something." }]);
  });

  it("AND LATER ROWS ARE NUMBERED FROM IT, the same way every time", () => {
    const answer = Array.from({ length: 10 }, (_, i) => `This is sentence ${i + 1} and it carries enough words to push the whole answer past the limit on its own.`).join(" ");
    const once = rowsForAnswer(why, answer);
    const twice = rowsForAnswer(why, answer);
    expect(once.length).toBeGreaterThan(1);
    expect(once).toEqual(twice);
    expect(once[0].title).toBe("Why us and not cheaper");
    expect(once[1].title).toBe("Why us and not cheaper (2)");
  });

  it("A QUESTION THAT WRITES TO THE LISTING TABLE PRODUCES NO KNOWLEDGE ROWS", () => {
    // A phone number is not a note. Returning one would write a
    // business's phone number into the prompt as prose.
    expect(rowsForAnswer(phone, "+91 91234 56789")).toEqual([]);
  });

  it("every question that writes a note has a category the database accepts", () => {
    for (const q of INTERVIEW_QUESTIONS) {
      if (q.writesTo.table !== "business_knowledge") continue;
      const rows = rowsForAnswer(q, "A sentence with 2 numbers in it, like 40 hours.");
      expect(rows.length).toBe(1);
      expect(KNOWLEDGE_CATEGORIES as readonly string[]).toContain(rows[0].category);
    }
  });
});

// ---------------------------------------------------------------------
describe("3. WHAT COUNTS AS CHECKABLE IS A DIGIT OR A UNIT, AND NOTHING CLEVERER", () => {
  it("A NUMBER PASSES", () => {
    expect(hasCheckableDetail("2 to 3 days")).toBe(true);
    expect(hasCheckableDetail("₹650 upwards")).toBe(true);
    expect(hasCheckableDetail("40 hours")).toBe(true);
  });

  it("A BARE NUMBER WITH NO UNIT PASSES TOO", () => {
    // FOUND BY A MUTATION. Every fixture above also carries a unit
    // ("days", "₹", "hours"), so deleting the digit half of the check
    // changed nothing — the unit half was quietly doing all the work.
    expect(hasCheckableDetail("we have 3 branches")).toBe(true);
    expect(hasCheckableDetail("open since 1998")).toBe(true);
  });

  it("A UNIT WITHOUT A DIGIT STILL PASSES", () => {
    expect(hasCheckableDetail("a few days")).toBe(true);
    expect(hasCheckableDetail("some hours")).toBe(true);
  });

  it("PRAISE WITH NO NUMBER AND NO UNIT DOES NOT", () => {
    expect(hasCheckableDetail("we are simply the best")).toBe(false);
    expect(hasCheckableDetail("premium quality, trusted by all")).toBe(false);
  });

  // SUBSTRINGS, NOT WORD BOUNDARIES, AND THAT IS THE POINT.
  //
  // FOUND BY A MUTATION. This file is largely regex literals, so the
  // text around a word in the SOURCE is `|\bjars?\b)` — and the
  // character before "j" is the "b" of "\b", which is a word
  // character. There is no word boundary there, so a /\bjars?\b/i
  // assertion could never match a trade word added inside the unit
  // pattern. It sat there looking like a rule-3 guard and guarded
  // nothing.
  //
  // A word-boundary assertion cannot police a file made of regexes.
  const TRADE_WORDS = ["candle", "jar", "plate", "bottle", "saree", "lehenga", "kurti", "mithai", "laddu", "barfi", "soy wax", "beeswax", "tuition", "coaching", "showroom", "test drive", "test ride", "batch"];

  it("THE UNITS NAME NOTHING THAT IS BEING MEASURED — rule 3", () => {
    // A rupee, a percentage, a day and a kilogram mean the same thing to
    // a sweet shop and a coaching centre. A unit list that named one
    // trade's quantities would be that trade's words handed to all of
    // them.
    const src = code("src/lib/onboarding/answerCheck.ts").toLowerCase();
    for (const word of TRADE_WORDS) expect(src).not.toContain(word);
  });

  it("AND NOR DOES THE VAGUE LIST, nor any other list in this file", () => {
    // Same sweep; the two lists live in one file and either one is a
    // leak.
    const src = code("src/lib/onboarding/answerCheck.ts").toLowerCase();
    for (const word of TRADE_WORDS) expect(src).not.toContain(word);
    // And the registry it serves, for the same reason.
    expect(code("src/lib/knowledge/noteShape.ts").toLowerCase()).not.toContain("candle");
  });
});

// ---------------------------------------------------------------------
describe("4. VAGUE MEANS NOTHING CHECKABLE *AND* A SUPERLATIVE", () => {
  it("THE FOUNDER'S OWN EXAMPLE IS FLAGGED", () => {
    expect(isVague("We have the best quality in the city")).toBe(true);
    expect(isVague("Premium, world-class service")).toBe(true);
  });

  it("A NUMBER RESCUES AN ANSWER THAT ALSO PRAISES ITSELF", () => {
    // "Best" is not forbidden. An answer that says why is fine.
    expect(isVague("The best because it burns for 40 hours, not 25")).toBe(false);
  });

  it("AND A PLAIN SPECIFIC SENTENCE IS LEFT ALONE, even with no number", () => {
    // THE UNDER-EAGERNESS, ON PURPOSE. This check cannot tell a specific
    // noun from a vague one without a vocabulary of one trade's words.
    // Arguing with an owner about a good answer is how an interview gets
    // abandoned, and a half-filled record looks complete to a generator.
    expect(isVague("We press it by hand and let it rest overnight")).toBe(false);
    expect(isVague("No machine is used at any step")).toBe(false);
  });

  it("an empty answer is not vague, it is absent", () => {
    expect(isVague("")).toBe(false);
    expect(isVague("   ")).toBe(false);
  });

  it("the vague words are reported in the order they were written", () => {
    expect(vagueWordsIn("Trusted and premium and the best")).toEqual(["trusted", "premium", "best"]);
  });
});

// ---------------------------------------------------------------------
describe("5. THE FOLLOW-UP NAMES THE WORD, AND IS ASKED ONCE", () => {
  it("IT QUOTES WHAT THE OWNER WROTE", () => {
    // "Be more specific" is not a question anybody can answer.
    const ask = followUpFor("we are the best in town");
    expect(ask).toContain('"best"');
    expect(ask).toMatch(/what is the number, the material or the time behind it/i);
  });

  it("AND IT OFFERS THE WAY OUT, so the owner is never stuck", () => {
    expect(followUpFor("premium quality")).toMatch(/if there isn't one, say so and we'll leave it out/i);
  });

  it("A FIRST VAGUE ANSWER IS NOT STORED AND IS ASKED BACK", () => {
    const v = judgeAnswer(why, "We are simply the best", { attempt: 1 });
    expect(v.store).toBe(false);
    expect(v.weak).toBe(true);
    expect(v.followUp).toContain('"best"');
    expect(v.rows).toEqual([]);
  });

  it("A SECOND VAGUE ANSWER IS STORED AND FLAGGED, NEVER BLOCKED", () => {
    // The founder's decision of 7 November. Refusing the owner's own
    // words is worse than recording them with a flag the generators can
    // read — and an owner who cannot get past a question abandons the
    // interview.
    const v = judgeAnswer(why, "We are simply the best", { attempt: 2 });
    expect(v.store).toBe(true);
    expect(v.weak).toBe(true);
    expect(v.followUp).toBeNull();
    expect(v.rows.length).toBe(1);
    expect(v.rows[0].content).toBe("We are simply the best");
    expect(v.reason).toMatch(/flagged as thin/);
  });

  it("AND IT IS NEVER ASKED A THIRD TIME", () => {
    for (const attempt of [2, 3, 7]) {
      expect(judgeAnswer(why, "the best", { attempt }).followUp).toBeNull();
    }
  });

  it("the default attempt is the first one", () => {
    expect(judgeAnswer(why, "we are the best").followUp).not.toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("6. THE CHECK ONLY RUNS WHERE THE REGISTRY ASKED FOR IT", () => {
  it("A QUESTION THAT DOES NOT NEED A FALSIFIABLE ANSWER IS NEVER FOLLOWED UP", () => {
    // "None" is the valuable answer to the certifications question, and
    // it contains nothing checkable by design.
    expect(certs.needsFalsifiable).toBe(false);
    const v = judgeAnswer(certs, "None, we have no certification");
    expect(v.store).toBe(true);
    expect(v.weak).toBe(false);
    expect(v.followUp).toBeNull();
  });

  it("EVEN WHEN THE ANSWER IS PURE PRAISE", () => {
    // FOUND BY A MUTATION. "None, we have no certification" is not
    // vague by this check's own rules, so dropping the
    // needsFalsifiable condition changed nothing about it. THIS answer
    // is vague, and the question still must not argue with it: the
    // registry said this answer is not one that gets written from.
    const v = judgeAnswer(certs, "We are premium and trusted");
    expect(v.store).toBe(true);
    expect(v.weak).toBe(false);
    expect(v.followUp).toBeNull();
  });

  it("AND A YES/NO IS NEVER FOLLOWED UP EITHER", () => {
    const promise = INTERVIEW_QUESTIONS.find((q) => q.key.startsWith("promise_"))!;
    const v = judgeAnswer(promise, "No");
    expect(v.store).toBe(true);
    expect(v.weak).toBe(false);
  });

  it("the questions that DO need it are followed up", () => {
    for (const key of ["why_not_cheaper", "materials_used", "delivery_time"]) {
      const q = questionByKey(key)!;
      expect(q.needsFalsifiable).toBe(true);
      expect(judgeAnswer(q, "the best there is").followUp).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------
describe("7. AN EMPTY ANSWER AND A BROKEN QUESTION ARE DIFFERENT FROM A WEAK ONE", () => {
  it("NOTHING WRITTEN IS NOT STORED, AND IS NOT FLAGGED WEAK", () => {
    // Storing an empty note would make "nobody answered" look like "the
    // answer is nothing", which are different facts — and the second one
    // is what a generator would read.
    const v = judgeAnswer(why, "   ");
    expect(v.store).toBe(false);
    expect(v.weak).toBe(false);
    expect(v.followUp).toBeNull();
    expect(v.reason).toBe("nothing was written");
  });

  it("A CATEGORY THE DATABASE WOULD REFUSE IS REFUSED HERE, LOUDLY", () => {
    // A bug, not the owner's problem — and caught before the insert
    // rather than at the worst possible moment.
    const broken = { ...why, writesTo: { table: "business_knowledge" as const, category: "nonsense" as any, title: "X" } };
    const v = judgeAnswer(broken, "It takes 3 days.");
    expect(v.store).toBe(false);
    expect(v.rows).toEqual([]);
    expect(v.reason).toMatch(/category the database does not allow/);
  });

  it("a good answer stores with no flag and no reason", () => {
    const v = judgeAnswer(why, "It lasts 40 hours instead of 25.");
    expect(v).toMatchObject({ store: true, weak: false, followUp: null, reason: null });
    expect(v.rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------
describe("8. THE CHECK IS DETERMINISTIC AND PURE", () => {
  it("NO MODEL CALL — decision 3, and it is what makes the verdict repeatable", () => {
    const src = sourceWithComments("src/lib/onboarding/answerCheck.ts");
    expect(src).not.toMatch(/^import .*(claude|anthropic|ai\/)/mi);
    expect(src).not.toMatch(/^import .*supabase/m);
    expect(src).not.toMatch(/^import .*react/mi);
  });

  it("AND THE SHARED CONSTANTS IMPORT NOTHING AT ALL", () => {
    // FOUND BY A MUTATION. The purity test read answerCheck.ts only,
    // while noteShape.ts is what it imports — and noteShape is read by
    // the registry, which a client component reads. One import of the
    // facts layer there pulls the whole of it into the bundle.
    const shape = sourceWithComments("src/lib/knowledge/noteShape.ts");
    expect(shape).not.toMatch(/^import /m);
  });

  it("THE SAME ANSWER JUDGED TWICE GIVES THE SAME VERDICT", () => {
    const answers = ["we are the best", "it takes 3 days", "", "premium quality service"];
    for (const a of answers) {
      expect(judgeAnswer(why, a, { attempt: 1 })).toEqual(judgeAnswer(why, a, { attempt: 1 }));
    }
  });

  it("AND THE FILE RECORDS WHY THE CLAIMS GUARD COULD NOT DO THIS JOB", () => {
    // claimCheck decides whether a claim is supported BY THE RECORDS.
    // Here the answer IS the record. Without this note somebody will
    // eventually delete this file and call findUnsupportedClaims.
    const src = sourceWithComments("src/lib/onboarding/answerCheck.ts");
    expect(src).toMatch(/Here the answer IS the record/);
  });

  it("AND WHY IT IS DELIBERATELY UNDER-EAGER", () => {
    const src = sourceWithComments("src/lib/onboarding/answerCheck.ts");
    expect(src).toMatch(/DELIBERATELY UNDER-EAGER/);
  });
});
