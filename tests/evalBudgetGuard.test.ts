// THE BUDGET GUARD — the instrument an approval is asked against.
//
// 2026-10-22: four confirmation runs were approved at about Rs 78 and
// cost Rs 94.73. Neither half of the guard did its job.
//
//   the estimate   described a four-call pipeline at 1100-1500 input
//                  tokens. The real one makes 5 to 8.7 calls a case at
//                  ~2600. It predicted Rs 2.55 a case against Rs 4.94.
//   the ceiling    was checked by each parallel run against the ledger
//                  as it stood when they ALL started, so four runs each
//                  found room for themselves in the same Rs 78.
//
// This is a B18 fault — the instrument telling a false story — and it
// is the most expensive class in this project: the numbers it produced
// were the numbers the founder approved.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { estimateInr, WORST_MEASURED_PER_CASE_INR, MEASURED_PER_CASE_INR } from "../scripts/eval/harness";

describe("1. the estimate is never cheaper than a case has actually been", () => {
  // THE LOAD-BEARING ASSERTION. An estimate that comes in under the
  // actual is not an approximation, it is a wrong number on an
  // approval request.
  it("COVERS EVERY RUN ANYONE HAS ACTUALLY PAID FOR", () => {
    expect(MEASURED_PER_CASE_INR.length).toBeGreaterThan(0);
    for (const m of MEASURED_PER_CASE_INR) {
      expect(estimateInr(m.cases)).toBeGreaterThanOrEqual(m.inr);
    }
  });

  it("AND THE DEAREST CASE ON RECORD IS THE FLOOR, NOT THE AVERAGE", () => {
    // Averaging is how an estimate stays plausible and still runs out
    // of money: the run that overshoots is the one being approved.
    const worst = Math.max(...MEASURED_PER_CASE_INR.map((m) => m.inr / m.cases));
    expect(WORST_MEASURED_PER_CASE_INR).toBeCloseTo(worst, 4);
    expect(estimateInr(1)).toBeGreaterThanOrEqual(worst);
  });

  it("keeps the 22 October runs on record, with their dates", () => {
    // The cheap way to make any estimate look right is to drop the
    // expensive measurement. These four rows ARE the incident.
    const oct = MEASURED_PER_CASE_INR.filter((m) => m.on === "2026-10-22");
    expect(oct.length).toBe(4);
    expect(Math.max(...oct.map((m) => m.inr))).toBeCloseTo(29.65, 2);
  });

  it("is not modelled as a hand-written list of calls any more", () => {
    // The old estimator named four calls and their token counts. That
    // is a second description of the pipeline, and it drifted the
    // moment a fifth call was added beside the extractor.
    const src = code("scripts/eval/harness.ts");
    expect(src).not.toMatch(/callsPerCase/);
    expect(src).toMatch(/MEASURED_PER_CASE_INR/);
  });

  it("AND THERE IS ONLY ONE OF IT", () => {
    // s1Exit used to define its own, which is the one that actually
    // gated spending while the harness's sat unused.
    const src = code("scripts/eval/s1Exit.eval.ts");
    expect(src).not.toMatch(/function estimateInr/);
    expect(src).toMatch(/estimateInr,/);
  });
});

describe("2. a run cannot spend money another run has already committed", () => {
  const src = code("scripts/eval/s1Exit.eval.ts");

  it("THE CEILING COUNTS WHAT IS IN FLIGHT, NOT JUST WHAT IS SPENT", () => {
    const gate = src.slice(src.indexOf("STOPPING: over a ceiling") - 600, src.indexOf("STOPPING: over a ceiling"));
    expect(gate).toMatch(/estimate \+ committed \+ spentSoFar > BUDGET_INR/);
  });

  it("RESERVES BEFORE IT CHECKS, because a later run can only see what is written", () => {
    const reserved = src.indexOf("reserve(RESERVE_KEY, estimate)");
    const checked = src.indexOf("estimate + committed + spentSoFar > BUDGET_INR");
    expect(reserved).toBeGreaterThan(-1);
    expect(checked).toBeGreaterThan(reserved);
  });

  it("releases the reservation only once the real row is on disk", () => {
    // ANCHORED ON THE LEDGER WRITE, NOT ON "${label}.json" — which
    // first matches the RESULTS file hundreds of lines earlier, so the
    // ordering held against the wrong landmark and the mutation that
    // released the reservation early passed (M59, 2026-10-22).
    const row = src.indexOf("join(LEDGER_D, `${label}.json`)");
    const release = src.lastIndexOf("releaseReservation(RESERVE_KEY)");
    expect(row).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(row);
  });

  it("gives back the reservation when it refuses to run", () => {
    const stop = src.indexOf("STOPPING: over a ceiling");
    const after = src.slice(stop, stop + 400);
    expect(after).toMatch(/releaseReservation\(RESERVE_KEY\)/);
  });

  it("treats an unreadable reservation as a full one, never as zero", () => {
    const fn = src.slice(src.indexOf("function outstandingInr"), src.indexOf("function reserve("));
    expect(fn).toMatch(/total \+= WORST_MEASURED_PER_CASE_INR/);
  });
});
