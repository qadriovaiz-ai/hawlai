// A RUN THAT WROTE NOTHING MUST SAY WHY.
//
// On 21 October four of twelve social cases failed at the write step
// and I could not tell the founder why, because nothing recorded it.
// The agents return `_cause`, `_detail`, `_malformed` and `_aiFailure`
// precisely so a caller can tell a truncated reply from an unreachable
// model from an exhausted account — and surfaces.ts threw all four
// away, keeping only `_incomplete`.
//
// The console said nothing either: vitest prints a test's stderr only
// when the test FAILS, and an incomplete run does not fail the test. So
// the run reported strictly less than the product knew, which is B18 —
// the instrument losing the finding.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";

const surfaces = () => code("scripts/eval/surfaces.ts");
const runner = () => code("scripts/eval/s1Exit.eval.ts");

describe("1. every surface reports the agent's own account", () => {
  it("ALL FIVE CARRY IT, not just the ones that happen to set _incomplete", () => {
    // Two surfaces return without `incomplete`, so a regex over that
    // line reached three of five. Counted rather than assumed.
    expect(surfaces().match(/failure: failureOf\(r\)/g) ?? []).toHaveLength(5);
  });

  it("AND IT READS ALL FOUR THINGS THE AGENTS ACTUALLY RETURN", () => {
    const src = surfaces();
    expect(src).toMatch(/r\._aiFailure\?\.kind/);
    expect(src).toMatch(/cause: r\._cause/);
    expect(src).toMatch(/detail: r\._detail/);
    expect(src).toMatch(/malformed: r\._malformed === true/);
  });

  it("a case with nothing wrong reports no failure at all", () => {
    // Otherwise every clean case would carry an empty object and the
    // incomplete list would stop meaning anything.
    expect(surfaces()).toMatch(/if \(!kind && !r\._cause && !r\._detail && !r\._malformed\) return null;/);
  });
});

describe("2. the runner keeps it and prints it", () => {
  it("IT IS SAVED PER CASE, so the results file answers the question later", () => {
    expect(runner()).toMatch(/failure: r\.failure \?\? null/);
  });

  it("AND PRINTED FOR EVERY INCOMPLETE CASE", () => {
    const src = runner();
    expect(src).toMatch(/for \(const p of incomplete\)/);
    expect(src).toMatch(/no reason recorded by the agent/);
    expect(src).toMatch(/threw: \$\{p\.error\}/);
  });

  it("the reason this exists is written down beside it", () => {
    expect(sourceWithComments("scripts/eval/surfaces.ts")).toMatch(/AND IT SHOULD HAVE EXISTED ALL ALONG/);
    expect(sourceWithComments("scripts/eval/surfaces.ts")).toMatch(/vitest only prints a test's stderr when/);
  });
});
