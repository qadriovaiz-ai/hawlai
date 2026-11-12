// The growth agent's work and the owner's report are two things now.
//
// WHY — R1, 12 November 2026. `runDailyGrowth` did four jobs in one
// function: perceive, diagnose, plan, send. The founder's decision is
// that the agent keeps working in the background while the report
// becomes something he asks for, and that CANNOT be done by deleting
// the send: the planning phase writes to the database.
// `recordFindings`, `writeSetupGoalDrafts`, `linkFindingsToGoals` and
// I6's `askForMissingFact` all ran in the middle of that function, so
// "no daily email" would have silently meant "no findings, no goal
// drafts, no interview question".
//
// R1 IS A PURE RESTRUCTURING. The same calls in the same order, the
// same report, the same send. These tests hold the seam: the work must
// keep doing the writing, the report must keep doing none of it, and
// neither may quietly absorb the other again.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const SOURCE = "src/lib/growth/dailyGrowth.ts";

/** The body of one exported function, from its signature to the next one. */
function bodyOf(name: string): string {
  const src = code(SOURCE);
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, `${name} is not exported from ${SOURCE}`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const nextExport = rest.indexOf("\nexport ");
  const nextPlain = rest.indexOf("\nasync function ");
  const ends = [nextExport, nextPlain].filter((i) => i > -1);
  const end = ends.length ? Math.min(...ends) : rest.length;
  return rest.slice(0, end);
}

/** Every write the planning phase does, and nothing that merely reads. */
const PLANNING_WRITES = [
  "recordFindings",
  "writeSetupGoalDrafts",
  "linkFindingsToGoals",
  "askForMissingFact",
];

describe("1. THE WORK DOES THE WRITING", () => {
  it("EVERY PLANNING WRITE IS IN runGrowthWork", () => {
    // THE LOAD-BEARING ONE. If one of these moves into the report
    // function, making the report on-demand stops it happening daily —
    // which is the exact failure R1 exists to prevent.
    const work = bodyOf("runGrowthWork");
    for (const call of PLANNING_WRITES) {
      expect(work, `${call} must run in the daily work`).toContain(call);
    }
  });

  it("AND IT PERCEIVES BEFORE IT PLANS", () => {
    const work = bodyOf("runGrowthWork");
    for (const read of ["auditSite", "auditCatalogue", "checkTracking"]) {
      expect(work, read).toContain(read);
    }
    expect(work.indexOf("checkTracking")).toBeLessThan(work.indexOf("recordFindings"));
  });

  it("IT BUILDS NO REPORT AND SENDS NOTHING", () => {
    const work = bodyOf("runGrowthWork");
    expect(work).not.toContain("buildDailyReport");
    expect(work).not.toContain("sendDealerEmail");
    expect(work).not.toContain("everyNumberIsCounted");
  });

  it("and it returns the plan rather than printing it", () => {
    const work = bodyOf("runGrowthWork");
    for (const field of ["findings", "setupGoals", "targetGoals", "askForFact", "picks"]) {
      expect(work, field).toContain(field);
    }
  });
});

describe("2. THE REPORT DOES NONE OF THE PLANNING", () => {
  it("NOT ONE PLANNING WRITE IS IN buildGrowthReport", () => {
    const report = bodyOf("buildGrowthReport");
    for (const call of PLANNING_WRITES) {
      expect(report, `${call} must NOT run while building a report`).not.toContain(call);
    }
  });

  it("AND IT DOES NOT PERCEIVE AGAIN EITHER", () => {
    // Mutation M6 added auditSite back into the report and survived,
    // because this section only checked the planning WRITES. A report
    // that re-reads the site costs the work twice and describes a state
    // the plan was not made from — by then the audit has already run
    // and its findings are what the report is about.
    const report = bodyOf("buildGrowthReport");
    for (const read of ["auditSite", "auditCatalogue", "checkTracking", "pickToday", "setupGoalsFrom"]) {
      expect(report, read + " belongs to the work, not the report").not.toContain(read);
    }
  });

  it("IT BUILDS, CHECKS, AND SENDS NOTHING", () => {
    const report = bodyOf("buildGrowthReport");
    expect(report).toContain("buildDailyReport");
    expect(report).toContain("everyNumberIsCounted");
    expect(report).toContain("withoutUncountedBlocks");
    // The send is the caller's decision, not the builder's.
    expect(report).not.toContain("sendDealerEmail");
  });

  it("AND THE CONSEQUENCES OF SHOWING SOMETHING STAY WITH IT", () => {
    // The left-out record and the un-marking of findings that were not
    // shown are both about having SHOWN something, so they belong with
    // the report and not with the work.
    const report = bodyOf("buildGrowthReport");
    expect(report).toContain("recordBlocksLeftOut");
    // markSurfaced, not the column name: R2a moved the write into a
    // named function, and what matters is that the report is the one
    // that records what it SHOWED.
    expect(report).toContain("markSurfaced");
    const work = bodyOf("runGrowthWork");
    expect(work, "the work must not mark anything as shown").not.toContain("markSurfaced");
  });
});

describe("3. THE DAILY RUN IS THE COMPOSITION OF THE TWO", () => {
  it("runDailyGrowth CALLS THE WORK, THEN THE REPORT, THEN SENDS", () => {
    const daily = bodyOf("runDailyGrowth");
    const work = daily.indexOf("runGrowthWork(");
    const report = daily.indexOf("buildGrowthReport(");
    const send = daily.indexOf("sendDealerEmail");
    expect(work).toBeGreaterThan(-1);
    expect(report).toBeGreaterThan(work);
    expect(send).toBeGreaterThan(report);
  });

  it("AND DOES NOT REDO EITHER OF THEM ITSELF", () => {
    // A composition that also audits or builds is the merge coming
    // back one call at a time.
    const daily = bodyOf("runDailyGrowth");
    for (const call of [...PLANNING_WRITES, "auditSite", "auditCatalogue", "buildDailyReport"]) {
      expect(daily, `${call} belongs to one of the two halves`).not.toContain(call);
    }
  });

  it("the dry run still sends nothing", () => {
    const daily = bodyOf("runDailyGrowth");
    expect(daily.indexOf("dryRun")).toBeLessThan(daily.indexOf("sendDealerEmail"));
  });

  it("and one email per business per day is still the rule", () => {
    expect(bodyOf("runDailyGrowth")).toContain("idempotencyKey");
  });
});

describe("4. THE SLICER ITSELF", () => {
  it("finds three different bodies, so the tests above are not all reading one blob", () => {
    const a = bodyOf("runGrowthWork");
    const b = bodyOf("buildGrowthReport");
    const c = bodyOf("runDailyGrowth");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a.length).toBeGreaterThan(500);
    expect(b.length).toBeGreaterThan(200);
    // The composition is the short one. If it grows past the work, the
    // split has come undone.
    expect(c.length).toBeLessThan(a.length);
  });
});
