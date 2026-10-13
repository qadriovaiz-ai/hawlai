// THE GRADING SHEET MUST NOT ANSWER FOR THE GRADER.
//
// 13 October 2026, the first baseline run. The sheet pre-filled a dash
// against every sentence this codebase's classifier did not call
// `factual`, and told both graders to leave those rows blank. 224 of
// 329 rows were pre-filled that way. The classifier reads romanised
// Hindi as sentiment, so the two sentences that run got genuinely
// wrong — "yeh slower aur cleaner jalte hain regular paraffin wax ke
// mukable" and "burn time bhi genuinely lamba hota hai", a comparison
// with a competitor's product and a performance claim — were both
// inside the pre-filled set. The baseline would have been graded clean
// while containing exactly the failure the whole initiative exists to
// stop.
//
// This pins the fix: a grader may answer "not a claim", but that answer
// is theirs to give.

import { describe, it, expect } from "vitest";
import { gradingSheet, type GradedSentence } from "../scripts/eval/harness";

function row(sentence: string, kind: string): GradedSentence {
  return {
    caseId: "c-01",
    fixture: "A Business",
    trade: "products",
    scenario: "complete_facts",
    surface: "email",
    field: "body",
    sentence,
    kind,
    availableFacts: ["price = 999"],
    removedByGuard: [],
    watch: "nothing in particular",
  };
}

/** The verdict cell of every data row in the sheet's tables. */
function verdictCells(sheet: string): string[] {
  return sheet
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .filter((l) => !/^\|\s*(?:verdict|-)/.test(l))
    .map((l) => l.split("|")[1]);
}

describe("the eval grading sheet", () => {
  it("LEAVES THE VERDICT EMPTY FOR EVERY SENTENCE, WHATEVER THE CLASSIFIER GUESSED", () => {
    const rows = [
      row("The lavender candle is 999.", "factual"),
      row("Yeh slower aur cleaner jalte hain regular paraffin wax ke mukable.", "feeling"),
      row("Order on the store page.", "cta"),
      row("Kya aap try karna chahenge?", "question"),
    ];
    const cells = verdictCells(gradingSheet(rows, "ovaiz"));
    expect(cells).toHaveLength(rows.length);
    for (const cell of cells) expect(cell.trim()).toBe("");
  });

  it("does not instruct the grader to skip anything", () => {
    const sheet = gradingSheet([row("The candle is 999.", "feeling")], "ovaiz");
    expect(sheet).not.toMatch(/leave\s+\S*\s*(?:feeling|cta|question)/i);
    expect(sheet).not.toMatch(/score\s+(?:every\s+)?factual\s+sentence/i);
    // And it says so positively, so the instruction cannot be lost by
    // deleting a negative.
    expect(sheet).toMatch(/score\s+\*\*every\*\*\s+sentence/i);
  });

  it("warns that the kind column is a guess, and names the sentence that proves it", () => {
    const sheet = gradingSheet([row("The candle is 999.", "factual")], "reviewer");
    expect(sheet).toMatch(/do not trust the `kind` column/i);
    expect(sheet).toMatch(/mukable/);
  });

  it("still shows the kind, because a hint the grader can overrule is worth having", () => {
    const sheet = gradingSheet([row("The candle is 999.", "factual")], "ovaiz");
    expect(sheet).toMatch(/\|\s*factual\s*\|/);
  });

  it("gives both graders the same sheet, so the second scorer is blind and not steered", () => {
    const rows = [row("The candle is 999.", "factual"), row("Accha laga.", "feeling")];
    const a = gradingSheet(rows, "ovaiz").split("\n").slice(1).join("\n");
    const b = gradingSheet(rows, "reviewer").split("\n").slice(1).join("\n");
    expect(a).toBe(b);
  });

  it("puts the records in front of the grader rather than making them go looking", () => {
    const sheet = gradingSheet([row("The candle is 999.", "factual")], "ovaiz");
    expect(sheet).toMatch(/price = 999/);
  });
});
