// A QUARANTINED TEST THAT NOBODY RUNS IS NOT A TEST.
//
// 5 November 2026. S7's exit test was written FIRST, at the founder's
// request, which is not what S5 or S6 did — both wrote theirs at P6,
// last. Written last, an exit test can be shaped by what was built;
// written first, it fixes the target while that is still inconvenient.
//
// THE COST OF WRITING IT FIRST is that it is RED for the length of the
// stage, and CLAUDE.md rule 1 is "real exit codes, pasted". A default
// suite with one known-red file means every commit for weeks pastes
// "1 failed" and asks the reader to remember which failure was
// expected. That is how a red suite stops meaning anything.
//
// So it lives in tests/open/ and runs under its own command, the way
// the smoke tests do. THIS FILE IS THE PRICE OF THAT ARRANGEMENT, and
// it runs in the DEFAULT suite:
//
//   1. the exclusion exists, and names exactly that directory
//   2. there IS a command that runs it, so "excluded" never quietly
//      becomes "never run"
//   3. every file in there carries a dated STAGE_OPEN marker naming
//      the stage and the phase that closes it
//   4. nothing sits in there without one
//
// WHEN A STAGE CLOSES the file moves to tests/ and joins the default
// suite. The marker goes with it, and a marker left behind in
// tests/open/ with no file fails nothing — which is why 4 is phrased as
// "every file needs a marker" rather than "every marker needs a file".
//
// WHAT THIS DELIBERATELY DOES NOT DO: assert that the open test is
// currently red. Running vitest inside vitest to find out costs a
// minute and would make this file the slowest in the suite, and the
// marker already records the expectation in words. If an open exit test
// has gone green, its stage is finished and the move is the next step.

import { describe, it, expect } from "vitest";
import fs from "fs";
import { sourceWithComments } from "./helpers/source";

const DIR = "tests/open";
const CONFIG = "vitest.open.config.mts";

function openFiles(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".test.ts"));
}

describe("1. the default suite knows what it is not running", () => {
  it("THE EXCLUSION EXISTS AND NAMES tests/open", () => {
    // Without this the `tests/**` glob picks the open exit test up and
    // the default suite goes red — which is the whole thing this
    // arrangement exists to avoid.
    const main = sourceWithComments("vitest.config.mts");
    expect(main).toMatch(/exclude:\s*\[[^\]]*"tests\/open\/\*\*"/);
  });

  it("AND THE EXCLUSION SAYS WHY, beside itself", () => {
    // Every exclusion in this config carries its reason — the smoke
    // one explains that it needs a running server. A silent exclusion
    // is a hole nobody can evaluate.
    const main = sourceWithComments("vitest.config.mts");
    const before = main.slice(Math.max(0, main.indexOf('"tests/open/**"') - 900), main.indexOf('"tests/open/**"'));
    expect(before).toMatch(/exit test/i);
    expect(before).toMatch(/red/i);
  });
});

describe("2. AND THERE IS A COMMAND THAT RUNS IT", () => {
  it("THE CONFIG EXISTS AND COVERS EXACTLY THAT DIRECTORY", () => {
    expect(fs.existsSync(CONFIG), `${CONFIG} is missing, so nothing runs tests/open`).toBe(true);
    const open = sourceWithComments(CONFIG);
    expect(open).toMatch(/include:\s*\["tests\/open\/\*\*\/\*\.test\.ts"\]/);
    // A run that passes because nothing ran would be indistinguishable
    // from a finished stage.
    expect(open).toMatch(/passWithNoTests:\s*false/);
  });

  it("AND package.json HAS THE SCRIPT, so it is one word to run", () => {
    // "Excluded from the suite" must not be the same thing as "nobody
    // can run it". This codebase has paid for that shape repeatedly:
    // a toggle over a path that does nothing, a count with no way to
    // see what it counted.
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.scripts?.["test:open"], "no test:open script").toBe(`vitest run --config ${CONFIG}`);
  });
});

describe("3. EVERY OPEN FILE SAYS WHICH STAGE IT BELONGS TO, AND WHEN", () => {
  it("THERE IS AT LEAST ONE, or this whole arrangement should be deleted", () => {
    // An empty tests/open with a config, a script and this guard is
    // three pieces of machinery for nothing. If a stage closes and
    // nothing replaces it, the next person should delete the lot
    // rather than inherit it.
    expect(openFiles().length, "tests/open is empty — delete the config, the script and this file").toBeGreaterThan(0);
  });

  it("AND EACH CARRIES A DATED STAGE_OPEN MARKER NAMING ITS CLOSING PHASE", () => {
    // The marker is the thing that stops this becoming a drawer. It
    // says which stage, when it opened, which phase closes it, and
    // that RED is the expected state — so a reader who finds the file
    // in a year knows whether it is a commitment or a leftover.
    for (const file of openFiles()) {
      const src = sourceWithComments(`${DIR}/${file}`);
      expect(src, `${file} has no STAGE_OPEN marker`).toMatch(/STAGE_OPEN:\s*S\d+, opened \d{4}-\d{2}-\d{2}, closes at P\d+/);
      expect(src, `${file} does not say it is expected to be red`).toMatch(/Expected state while open:\s*RED/);
      expect(src, `${file} does not say how to run it`).toMatch(/npm run test:open/);
    }
  });

  it("and the marker's date is a real one, not a placeholder", () => {
    for (const file of openFiles()) {
      const src = sourceWithComments(`${DIR}/${file}`);
      const day = /STAGE_OPEN:\s*S\d+, opened (\d{4}-\d{2}-\d{2})/.exec(src)?.[1] ?? "";
      expect(Number.isFinite(Date.parse(`${day}T00:00:00+05:30`)), `${file}: ${day}`).toBe(true);
      // Not in the future, which is the one wrong date that would make
      // "opened" meaningless.
      expect(Date.parse(`${day}T00:00:00+05:30`)).toBeLessThanOrEqual(Date.now());
    }
  });
});
