// THE THIRTEEN THE REVIEWER FOUND, AND THE THREE FIXES FOR THEM.
//
// The S1 exit run of 16 October 2026 was graded by the reviewer: 13
// unsupported claims sitting in drafts with NO mark. I had reported 0,
// because I printed the pipeline's own account of itself as a result.
//
// Three classes, from his list rather than my reading of the output —
// and that distinction earned its keep: my own guess had four
// sentences, missed the dairy-04 pair entirely, and filed dairy-07
// under the wrong shape.
//
//   A1  a CLAUSE riding on a true fact, after a dash / kyunki / aur
//   A2  a MODIFIER inside the noun phrase — "pure" is not a clause at
//       all, and the clause-aware fix I first planned would have sailed
//       straight past it
//   B   the records-unreadable case, which never entered the pipeline
//
// What is testable for free is that each fix is WHERE it needs to be.
// Whether the extractor now enumerates these thirteen is a measurement,
// and it is the second gate's job.

import { describe, it, expect, afterEach } from "vitest";
import { code, sourceWithComments } from "./helpers/source";
import { factBoundEnabled, factBoundPrompt, type CopyRequest } from "@/lib/content/generateCopy";
import { MISSED_BY_GATE, distinctMissed, missedByClass } from "../scripts/eval/missedByGate";

const ORIGINAL_FLAG = process.env.FACT_BOUND_COPY;
afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.FACT_BOUND_COPY;
  else process.env.FACT_BOUND_COPY = ORIGINAL_FLAG;
});

function request(over: Partial<CopyRequest> = {}): CopyRequest {
  return {
    topic: "welcome email", businessName: "A Business", businessCategory: "x",
    facts: {} as any, mode: "draft", revise: false, operation: "email_generation",
    factBound: true, brief: { label: "welcome email", instructions: "Welcome them." },
    ...over,
  };
}

describe("the known-missed set", () => {
  it("is the reviewer's list, whole", () => {
    expect(MISSED_BY_GATE).toHaveLength(13);
    // Four A1, not three: candle-05 carries three and salon-05 one.
    expect(missedByClass()).toEqual({ A1: 4, A2: 3, B: 6 });
    // THREE are the same sentence twice, in a subject and a body — the
    // founder marked three, and my first count said four.
    expect(distinctMissed()).toHaveLength(10);
    expect(MISSED_BY_GATE.filter((m) => m.duplicate)).toHaveLength(3);
  });

  it("names the cases the founder named", () => {
    expect(new Set(MISSED_BY_GATE.map((m) => m.caseId))).toEqual(new Set(["candle-05", "candle-08", "salon-05", "dairy-07", "dairy-04"]));
  });

  it("SIX OF THIRTEEN ARE ONE CASE THAT NEVER RAN THE PIPELINE", () => {
    // Which is why fix 1 is worth more than the other two put together.
    expect(MISSED_BY_GATE.filter((m) => m.klass === "B").every((m) => m.caseId === "candle-08")).toBe(true);
  });
});

describe("fix 1 — the records-unreadable case enters the pipeline", () => {
  it("THE FLAG NO LONGER DEPENDS ON HAVING RECORDS", () => {
    // `&& Boolean(req.facts)` was the third condition, and it sent
    // candle-08 down the old path. A business whose records cannot be
    // read is when this pipeline matters most.
    process.env.FACT_BOUND_COPY = "1";
    expect(factBoundEnabled(request({ facts: null }))).toBe(true);
    expect(factBoundEnabled(request({ facts: undefined }))).toBe(true);
    // The other two conditions still hold.
    expect(factBoundEnabled(request({ factBound: false }))).toBe(false);
    delete process.env.FACT_BOUND_COPY;
    expect(factBoundEnabled(request())).toBe(false);
  });

  it("AND NOTHING-TO-SELECT-FROM IS NOT A FAILURE TO SELECT", () => {
    // No records means no Select call at all — not a model failure.
    // One writes a short honest email; the other must write nothing.
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/if \(!ctx\.records\.length\) \{/);
    expect(src).toMatch(/selection = \{ claims: \[\], conflicts: \[\], unknowns: ctx\.unknowns \}/);
  });

  it("a piece with no records is told to write nothing factual", () => {
    const prompt = factBoundPrompt(request(), [], ["everything — the business's records could not be read just now"]);
    expect(prompt).toMatch(/NO FACT WAS APPROVED FOR THIS PIECE/);
    expect(prompt).toMatch(/Do not fill the gap/);
  });
});

describe("fix 2 — the extractor sees both claims in one sentence", () => {
  const src = () => code("src/lib/facts/extractClaims.ts");

  it("A1: A JUDGEMENT ADDED TO A FACT IS ITS OWN CLAIM", () => {
    expect(src()).toMatch(/ONE SENTENCE OFTEN CARRIES TWO CLAIMS/);
    // The joins the thirteen actually used.
    for (const join of ["dash", "aur", "kyunki", "isliye", "matlab"]) {
      expect(src(), join).toMatch(new RegExp(join));
    }
    // The sentence that makes it dangerous.
    expect(src()).toMatch(/The true half does NOT vouch for the other half/);
  });

  it("A2: A MODIFIER IS A CLAIM WITH NO CLAUSE OF ITS OWN", () => {
    // The part my first plan would have missed entirely.
    expect(src()).toMatch(/A MODIFIER CAN BE A WHOLE CLAIM WITH NO CLAUSE OF ITS OWN/);
    // toContain, NOT a regex built in a template literal. `\b` inside
    // one is BACKSPACE (0x08), not a word boundary, so
    // new RegExp(`\b${word}\b`) looks for a control character and never
    // matches. CLAUDE.md records four incidents of this; this was the
    // fifth, and it cost a red test that looked like a missing rule.
    for (const word of ["pure", "genuine", "authentic", "asli", "shudh"]) {
      expect(src(), word).toContain(word);
    }
    expect(src()).toMatch(/even when it is a single word inside a longer phrase/);
  });

  it("the rules are numbered without a gap or a repeat", () => {
    // They were renumbered twice while being added, and a prompt with
    // two rule 10s is a prompt the model reads once.
    const numbers = [...src().matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    const inPrompt = numbers.filter((n) => n <= 14);
    expect(new Set(inPrompt).size).toBe(inPrompt.length);
  });
});

describe("fix 3 — the writer is told not to write them", () => {
  const prompt = () => factBoundPrompt(request(), [{ id: "c1", claimType: "price", factIds: ["f1"], intent: "the price", value: 999, unit: "inr" }], []);

  it("A1: NO JUDGEMENT BOLTED ONTO A FACT", () => {
    expect(prompt()).toMatch(/DO NOT ADD A JUDGEMENT TO A FACT/);
    // The flourishes from the reviewer's own list.
    expect(prompt()).toMatch(/that's the difference/);
    expect(prompt()).toMatch(/results are real/);
  });

  it("A2: NO STRENGTHENING WORD UNLESS IT IS IN THE LIST", () => {
    expect(prompt()).toMatch(/DO NOT STRENGTHEN A FACT WITH A WORD/);
    expect(prompt()).toMatch(/Not pure, genuine, authentic/);
    expect(prompt()).toMatch(/unless that exact word is in the list above/);
  });

  it("IT IS INSURANCE, NOT THE FIX, and says so", () => {
    // A later prompt change would re-open anything only said here. The
    // verifier is what has to hold.
    // sourceWithComments, because the thing being asserted IS a
    // comment — code() strips them, which is CLAUDE.md rule 8 and the
    // reason this line is not a grep for the prompt text.
    expect(sourceWithComments("src/lib/content/generateCopy.ts")).toMatch(/Insurance[\s\S]{0,20}rather than the fix/);
  });
});
