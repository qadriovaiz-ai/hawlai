// AN INCOMPLETE RUN MUST NEVER READ AS A CLEAN ONE — ON EVERY SURFACE.
//
// The founder's rule of 2026-10-16, after a run reported "cases that
// failed 0" at a suspiciously cheap Rs 9.46 while five of nine cases
// had produced nothing but the AI-failure message. The pipeline failed
// closed exactly as designed and nothing threw, so the eval read the
// wreck as a result.
//
// THE EIGHTH S2a RUN, 20 OCTOBER 2026, DID IT AGAIN. dairy-10's whole
// message was "Something went wrong writing this — try again." The run
// printed "CASES THAT WROTE NOTHING 0 of 6", recorded 28 sentences, and
// offered itself for the founder's blind grading.
//
// The cause was mine and it was not subtle: surfaces.ts reads
// `r._incomplete` for every surface, and I wired WhatsApp into the eval
// without giving its agent anything to put there. The fix on email was
// never a fix on the pipeline — it was a fix on email.
//
// So this test is about the SHAPE, not about WhatsApp: every surface
// the eval drives must propagate it, and the next surface added cannot
// repeat this quietly.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";

/** Every agent the eval's runCase calls, and the file it lives in. */
const SURFACES: { surface: string; file: string }[] = [
  { surface: "email", file: "src/lib/agents/emailMarketingAgent.ts" },
  { surface: "whatsapp", file: "src/lib/agents/whatsappMarketingAgent.ts" },
  { surface: "facebook_post", file: "src/lib/agents/contentMarketingAgent.ts" },
];

describe("1. the eval asks every surface the same question", () => {
  it("surfaces.ts reads _incomplete for the surfaces that report it", () => {
    const src = code("scripts/eval/surfaces.ts");
    const reads = src.match(/incomplete: r\._incomplete === true/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(3);
  });

  it("AND EVERY AGENT IT ASKS ACTUALLY ANSWERS", () => {
    // The gap that cost run 8: the question was asked of an agent that
    // had no way to answer, so the answer was always "fine".
    for (const { surface, file } of SURFACES) {
      const src = code(file);
      expect(src, `${surface} must declare _incomplete in its return type`).toMatch(/_incomplete\?: boolean/);
      expect(src, `${surface} must set it when nothing was written`).toMatch(/_incomplete: true/);
    }
  });
});

describe("1b. the rule, stated once and checked everywhere", () => {
  // THREE RUNS PAID FOR THIS LESSON, one layer at a time:
  //
  //   run 8  WhatsApp never propagated _incomplete at all
  //   (same)  the test for that found contentMarketingAgent missing it too
  //   run 9  _malformed carried it on no surface, so dairy-05 shipped
  //          "Something went wrong writing this" and the run again
  //          reported incomplete: false
  //
  // Each time I fixed the branch in front of me. The rule is simpler
  // than the branches: ANY return whose output is a failure message
  // instead of copy is incomplete. Checked as a rule, so the next
  // branch cannot be missed in the same way.

  it("EVERY FALLBACK RETURN SAYS NOTHING WAS WRITTEN", () => {
    for (const { surface, file } of SURFACES) {
      const lines = code(file)
        .split(/\r?\n/)
        .filter((l) => /return \{[^}]*\.\.\.fallback/.test(l));
      expect(lines.length, `${surface} should have fallback returns to check`).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, `${surface}: a fallback return without _incomplete`).toMatch(/_incomplete: true/);
      }
    }
  });

  it("AND A MALFORMED REPLY IS ONE OF THEM, on every surface", () => {
    // The run-9 gap specifically. _malformed was surfaced for
    // diagnostics and not as "nothing usable came back".
    for (const { surface, file } of SURFACES) {
      expect(code(file), `${surface}`).toMatch(/_malformed: true, _incomplete: true/);
    }
  });
});

describe("2. the WhatsApp surface, which is where it broke", () => {
  const src = () => code("src/lib/agents/whatsappMarketingAgent.ts");

  it("EVERY PATH THAT WRITES NOTHING SAYS SO", () => {
    // Four ways this agent can produce no copy: an AI failure, an
    // incomplete door, a plain fallback, and an unknown task. A test
    // that only pinned the first would have passed before run 8.
    expect(src()).toMatch(/if \(copy\._aiFailure\) return \{ output: copy\.output, _fallback: true, _aiFailure: copy\._aiFailure, _incomplete: copy\.incomplete === true \}/);
    expect(src()).toMatch(/if \(copy\.incomplete\) return \{ output: copy\.output, _fallback: true, _incomplete: true \}/);
    expect(src()).toMatch(/if \(copy\._fallback\) return \{ \.\.\.fallback, _incomplete: true \}/);
    expect(src()).toMatch(/Unknown task type\." \}, _fallback: true, _incomplete: true/);
  });

  it("and a thrown error is nothing written too", () => {
    expect(src()).toMatch(/return \{ \.\.\.fallback, _incomplete: true \};/);
  });

  it("the incident is recorded where the propagation lives", () => {
    // CLAUDE.md rule 8 — the comment is the assertion.
    const withComments = sourceWithComments("src/lib/agents/whatsappMarketingAgent.ts");
    expect(withComments).toMatch(/an incomplete run must never\s*\n?\s*\/\/ read as a clean one/);
    expect(withComments).toMatch(/was implemented on one surface only/);
  });
});
