// THE GATE IN FRONT OF A HUMAN HOUR.
//
// scripts/eval/outputGate.eval.ts re-reads a finished run's SURVIVING
// sentences and asks the extractor about them from scratch, because
// three times a run's own removal list was not evidence of anything —
// run 6 shipped "[LICENSE NUMBER NEEDED]" with no removal, run 7 a
// reworded benefit claim, and run 8 printed zero removals across six
// cases while one case had failed closed and another's extractor came
// back empty.
//
// Run on run 8 for Rs 2.54, it found both faults: salon-04's benefit
// claim and dairy-10's failure. That is the founder's first two numbers,
// mechanically, before anybody spends an hour grading.
//
// These tests are about the gate's own honesty, because a gate that
// flatters a run is worse than no gate.

import { describe, it, expect } from "vitest";
import { UNLICENSABLE_TYPES, NEEDS_RECIPIENT_RECORD } from "@/lib/facts/extractClaims";
import { code, sourceWithComments } from "./helpers/source";

const src = () => code("scripts/eval/outputGate.eval.ts");

describe("1. what it refuses", () => {
  it("EVERY TYPE NOTHING CAN LICENSE IS A SURVIVOR, and the two lists are the source", () => {
    // Not a hand-copied list. If a new unlicensable type is added to
    // the pipeline, the gate must look for it without being edited.
    expect(src()).toMatch(/const REFUSED = new Set<string>\(\[\.\.\.UNLICENSABLE_TYPES, \.\.\.NEEDS_RECIPIENT_RECORD\]\)/);
    expect([...UNLICENSABLE_TYPES, ...NEEDS_RECIPIENT_RECORD]).toEqual(
      expect.arrayContaining(["benefit", "safety", "capability", "comparison", "customer_state"])
    );
  });

  it("A CASE THAT DID NOT RUN IS NOT A CASE THAT PASSED", () => {
    // run 8's dairy-10 shipped the AI-failure text and was counted as
    // 2 sentences of clean copy.
    expect(src()).toMatch(/const FAILURE_MARKERS/);
    expect(src()).toMatch(/something went wrong/);
    expect(src()).toMatch(/EXTRACTOR UNREACHABLE/);
  });

  it("AND AN EMPTY ANSWER IS CALLED OUT RATHER THAN COUNTED AS CLEAN", () => {
    expect(src()).toMatch(/NO CLAIMS REPORTED/);
    expect(sourceWithComments("scripts/eval/outputGate.eval.ts")).toMatch(/Saying nothing is not saying it is fine/);
  });

  it("the verdict needs all three to be clear", () => {
    expect(src()).toMatch(
      /const worth = survivors\.length === 0 && notCopyFound\.length === 0 && failed\.length === 0/
    );
  });
});

describe("2. it measures the batch the pipeline sent", () => {
  it("THE OPT-OUT LINE IS EXCLUDED — the door never saw it", () => {
    // It is appended after the door by addWhatsappOptOut, so including
    // it would gate the pipeline on a sentence it never handled. That
    // is the mistake the first recall gate made at full price.
    expect(src()).toMatch(/text\.includes\("Reply STOP"\) \|\| text\.includes\(WHATSAPP_OPT_OUT\)/);
    expect(sourceWithComments("scripts/eval/outputGate.eval.ts")).toMatch(/the batch the pipeline sent/);
  });

  it("and it reads a saved run rather than generating new copy", () => {
    expect(src()).toMatch(/readFileSync\(file, "utf8"\)/);
    expect(src()).not.toMatch(/generateCopy|runCase/);
  });
});

describe("3. it does not pretend to replace the person", () => {
  it("SAYS SO IN ITS OWN HEADER", () => {
    // A vague claim riding on a true fact is invisible to the
    // extractor and still needs the founder's blind grading. A gate
    // that claimed otherwise would quietly replace the only
    // measurement that has ever caught those.
    const withComments = sourceWithComments("scripts/eval/outputGate.eval.ts");
    expect(withComments).toMatch(/IT IS NOT A SUBSTITUTE FOR THE BLIND GRADING/);
    expect(withComments).toMatch(/still needs a/);
  });

  it("and it charges the ledger like every other paid run", () => {
    expect(src()).toMatch(/ledger\.totalInr = Math\.round\(\(ledger\.totalInr \+ spent\) \* 100\) \/ 100/);
    expect(src()).toMatch(/const GO = process\.env\.EVAL_GO === "1"/);
  });
});
