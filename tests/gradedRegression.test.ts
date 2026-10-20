// THE TWO GRADED RUNS, AS A REGRESSION TEST.
//
// docs/PLAN-S2-ADVERSARIAL.md §6, approved 2026-10-20. S1 run 11 — 130
// sentences, nine cases, zero F — and S2a run 14 — 26 sentences, one F
// — are the only fully graded results this project has. Until now the
// grading lived in a chat message, and the next change could undo it
// silently.
//
// WHAT THIS PROTECTS. Eight of the sixteen known bug-shapes are B9: a
// code check deleting true copy. A sentence a human has certified as
// true is the sharpest possible test of that, and there are 155 of
// them here. The next time I widen a rule, this file is what goes red.
//
// WHAT IT CANNOT DO. The model steps cannot be replayed for nothing, so
// this pins the CODE checks only — introducedWords and notCopy. That is
// the right half to pin: those two are where the eight incidents came
// from.
//
// AND NOTHING IS EVER GRADED TWICE. Any surface that grades clean from
// here joins scripts/eval/graded.ts, so the set grows and the founder's
// hour is spent once per result.

import { describe, it, expect } from "vitest";
import { GRADED, type GradedSentence } from "../scripts/eval/graded";
import { introducedWords } from "@/lib/content/introducedWords";
import { notCopySentences } from "@/lib/content/notCopy";
import { contextFromFacts } from "@/lib/facts/getContext";
import { FIXTURES } from "../scripts/eval/fixtures";

/** The fixture a graded row came from, by trade. */
function fixtureFor(row: GradedSentence) {
  const f = FIXTURES.find((x) => x.trade === row.trade);
  if (!f) throw new Error(`no fixture for trade ${row.trade}`);
  return f;
}

/**
 * The vocabulary that piece was written with.
 *
 * Built from the fixture, as in the tier-1 runner and for the same
 * reason: a hand-written list makes a surviving sentence survive for
 * the wrong reason.
 */
function vocabularyFor(row: GradedSentence): string[] {
  const f = fixtureFor(row);
  const ctx = contextFromFacts("biz_eval", f.facts, {
    kind: row.surface === "whatsapp" ? "whatsapp" : "email",
    topic: row.caseId,
  });
  const facts = f.facts as any;
  return [
    ...ctx.records.map((r) => `${r.key.replace(/[._]/g, " ")} ${r.recordedText} ${r.value ?? ""}`),
    facts.businessName ?? "",
    facts.category ?? "",
  ];
}

function removedByCodeChecks(row: GradedSentence): string[] {
  const reasons: string[] = [];
  for (const f of notCopySentences([row.sentence])) reasons.push(`notCopy:${f.reason}`);
  for (const f of introducedWords([row.sentence], vocabularyFor(row))) reasons.push(`${f.kind}:${f.word}`);
  return reasons;
}

const CLEAN = GRADED.filter((g) => g.verdict === "clean");
const FALSE_ONES = GRADED.filter((g) => g.verdict === "false");

describe("1. the fixture itself", () => {
  it("HOLDS BOTH GRADED RUNS, with the counts the founder reported", () => {
    expect(GRADED.filter((g) => g.run === "s1-run-11")).toHaveLength(130);
    // Run 14's sheet carried 30 rows across 6 cases; he graded 26
    // sentences, the rest being bare emoji that carry no claim.
    expect(GRADED.filter((g) => g.run === "s2a-run-14").length).toBeGreaterThanOrEqual(26);
    expect(FALSE_ONES).toHaveLength(1);
  });

  it("and every row names a trade that still has a fixture", () => {
    for (const row of GRADED) expect(() => fixtureFor(row), row.caseId).not.toThrow();
  });
});

describe("2. NOTHING THE FOUNDER GRADED TRUE MAY BE REMOVED BY A CODE CHECK", () => {
  // The guard against B9, which has bitten eight times. 155 sentences a
  // human has certified, checked on every commit, for nothing.
  //
  // A FAILURE HERE IS NOT AUTOMATICALLY A BUG. A rule approved AFTER a
  // run can legitimately change a verdict — the minimiser check of 20
  // October is exactly that, and it would now remove a sentence from
  // run 11 if run 11 had one. So a red test here means: a sentence a
  // human called true is now being deleted, and somebody has to decide
  // which of the two is wrong. It must never be decided by quietly
  // dropping the row.
  it("all of them survive, and any that does not is named", () => {
    const casualties = CLEAN.map((row) => ({ row, reasons: removedByCodeChecks(row) })).filter((x) => x.reasons.length);
    const report = casualties.map((x) => `[${x.row.run} ${x.row.caseId}] "${x.row.sentence}" — ${x.reasons.join(", ")}`);
    expect(report, `${casualties.length} graded-true sentence(s) would now be deleted`).toEqual([]);
  });
});

describe("3. and what he graded false is still caught", () => {
  it("THE ONE F IS CAUGHT BY A CODE CHECK", () => {
    // Half of it is: "just" is a minimiser in front of a figure. The
    // other half — a delivery area inferred from a city plus a rate —
    // is the judge's, and no free check can see it.
    for (const row of FALSE_ONES) {
      const reasons = removedByCodeChecks(row);
      expect(reasons, `${row.sentence} — ${row.why}`).toContain("minimiser:just");
    }
  });
});

describe("4. the set is worth what it claims", () => {
  it("IT IS MOSTLY FACTUAL COPY, not greetings", () => {
    // A fixture of 155 "Hi!"s would pass forever and protect nothing.
    const substantial = CLEAN.filter((g) => g.sentence.trim().split(/\s+/).length >= 4);
    expect(substantial.length).toBeGreaterThan(70);
  });

  it("and it covers more than one surface and more than one trade", () => {
    expect(new Set(GRADED.map((g) => g.surface)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(GRADED.map((g) => g.trade)).size).toBeGreaterThanOrEqual(3);
  });
});
