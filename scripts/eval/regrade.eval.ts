// REBUILD THE GRADING SHEETS FROM A RUN THAT ALREADY HAPPENED.
//
//   npx vitest run --config vitest.eval.config.mts scripts/eval/regrade.eval.ts
//
// FREE. It calls nothing and spends nothing: every sentence of every
// run is already in the run's .json, so a change to how the sheet is
// laid out never costs a second run. That matters more than it sounds —
// the first baseline's sheets told both graders to skip 224 of 329
// sentences, and without this the only way to fix that would have been
// to pay for the copy again.

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gradingSheet, type GradedSentence } from "./harness";

const OUT = join("scripts", "eval", "results");
const GRADERS = ["ovaiz", "reviewer"];

/** Every run file, newest last. */
function runs(): string[] {
  if (!existsSync(OUT)) return [];
  return readdirSync(OUT)
    .filter((f) => f.endsWith(".json") && f !== "spend.json")
    .sort();
}

describe("eval: rebuild the grading sheets", () => {
  it("rewrites both sheets for every run on disk", () => {
    const files = runs();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const parsed = JSON.parse(readFileSync(join(OUT, file), "utf8")) as {
        label: string;
        rows: GradedSentence[];
      };
      // A run with no sentences would silently write two empty sheets
      // that look finished. Fail instead.
      expect(parsed.rows.length).toBeGreaterThan(0);
      for (const grader of GRADERS) {
        const path = join(OUT, `${parsed.label}-grade-${grader}.md`);
        writeFileSync(path, gradingSheet(parsed.rows, grader), "utf8");
        process.stdout.write(`rewrote ${path}  (${parsed.rows.length} sentences)\n`);
      }
    }
  });
});
