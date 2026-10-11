// ONE DOOR, AND A BACKLOG THAT CAN ONLY SHRINK.
//
// The failure this file exists to stop is not a bug - it is a habit.
// Every protection in this codebase was written inside the generator I
// happened to be looking at, so each new one started life on exactly
// one path. Measured on 2026-10-11:
//
//   claims + provenance        18 of 29 copy paths
//   customer-first structure    1
//   word cap                    1
//   anti-generic                1
//   specificity editor          1
//
// I committed that mistake three times WHILE FIXING IT. A test is the
// only thing that makes it stop, because the next unguarded generator
// will look perfectly reasonable on the day it is written.
//
// HOW THIS WORKS. Every file that calls the model is either:
//   - through the door: it imports generateCopy, or
//   - in MIGRATING: customer-facing copy not yet moved, with a date, or
//   - in NOT_COPY: it does not write customer-facing copy, with the
//     reason spelled out.
//
// A file in MIGRATING that now imports the door FAILS THIS SUITE until
// its entry is deleted, the same arrangement
// tests/sourceGrepDiscipline.test.ts uses. So the backlog shrinks
// visibly instead of rotting, and the phase can actually be finished.
//
// A new file that calls the model and is in neither list fails too.
// That is the point: a new generator cannot start unguarded.
//
// WHAT THIS DOES NOT CATCH, stated so it is known rather than
// discovered: a file that imports generateCopy and ALSO calls the model
// directly for a second piece of text. The import is necessary, not
// sufficient.

import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "./helpers/source";

const ROOT = "src";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full.split("\\").join("/"));
  }
  return out;
}

/**
 * Files that call the model.
 *
 * Comments are stripped first (CLAUDE.md rule 8): a file that merely
 * MENTIONS callClaude in a comment explaining why it does not use it
 * would otherwise be dragged in.
 */
const MODEL_CALLERS = walk(ROOT)
  .filter((f) => f !== "src/lib/ai/claude.ts" && f !== "src/lib/content/generateCopy.ts")
  .filter((f) => /\bcallClaude\s*\(/.test(code(f)));

/**
 * Through the door.
 *
 * A WHOLE-WORD match, and that detail matters: creativeAgent.ts exports
 * `generateCopyVariations`, which contains the string "generateCopy" and
 * would have read as migrated while having no guard at all.
 */
function throughTheDoor(file: string): boolean {
  const src = code(file);
  return /\bgenerateCopy\b\s*[(,)]/.test(src) && /from\s+"@\/lib\/content\/generateCopy"/.test(src);
}

/**
 * Customer-facing copy not yet through the door.
 *
 * Every entry has the date it was listed and the migration step from
 * docs/PLAN-PHASE-3.5.md. NOTHING NEW GOES ON THIS LIST - a new
 * customer-facing generator goes through the door on the day it is
 * written.
 */
const MIGRATING: Record<string, string> = {
  // step 2 — DONE 2026-10-11. contentAgent (the lead message),
  // retentionAgent (the customer message) and influencerAgent (the
  // outreach) are through the door and their entries are deleted, which
  // is what this list is for.
  // step 3 — Facebook / Instagram. contentMarketingAgent went through
  // the door on 2026-10-11 and its entry is deleted; it was the agent
  // that HAD every measure, as its own copy, which is exactly why no
  // other surface did.
  "src/lib/agents/socialMediaAgent.ts": "2026-10-11, step 3: reads and writes posts on the platform",
  // step 4 — DONE 2026-10-11. WhatsApp and the CUSTOMER-FACING social
  // tasks are through the door. socialManagementAgent still calls the
  // model directly for viral_trends, which searches the web and is
  // research for the owner, and for the owner-facing tasks whose
  // guidance the copy guard would strip ("post three times a week").
  // step 5 — ads
  "src/lib/agents/paidAdsAgent.ts": "2026-10-11, step 5",
  "src/lib/agents/retargetingAgent.ts": "2026-10-11, step 5",
  "src/lib/adEngine.ts": "2026-10-11, step 5",
  // step 6 — SEO, AEO and CRO
  "src/lib/agents/seoAgent.ts": "2026-10-11, step 6: blog posts and page titles, NO output guard today",
  "src/lib/agents/seoPageAgent.ts": "2026-10-11, step 6: published landing pages, NO output guard today",
  "src/lib/agents/seoToolkitAgent.ts": "2026-10-11, step 6",
  "src/lib/agents/aeoAgent.ts": "2026-10-11, step 6: published answers, NO output guard today",
  "src/lib/agents/croAgentV2.ts": "2026-10-11, step 6: copy suggestions the owner pastes onto the site",
  // step 7 — websites and long-form shapes
  "src/lib/agents/websiteAgent.ts": "2026-10-11, step 7: live site copy, NO output guard today",
  "src/lib/agents/websiteBuilderAgent.ts": "2026-10-11, step 7: block trees, a different output shape",
  "src/lib/agents/creativeAgent.ts": "2026-10-11, step 7: product descriptions and video scripts, NO output guard today",
  "src/lib/agents/videoMarketingAgent.ts": "2026-10-11, step 7: captions and scripts, NO output guard today",
  "src/lib/agents/brandBuildingAgent.ts": "2026-10-11, step 7: taglines that become copy everywhere",
  // the chat, which writes prose of its own
  "src/lib/agents/masterBrainV2.ts": "2026-10-11, step 3: the chat's own prose; guarded by replyClaims today",
  "src/lib/agents/chatbotAgent.ts": "2026-10-11, step 4: the website widget's replies",
  // the calendar writes post drafts
  "src/lib/strategy/calendar/write.ts": "2026-10-11, step 3: calendar post drafts, reports claims but does not strip",
};

/**
 * Not customer-facing copy.
 *
 * These analyse, score, plan or research FOR THE OWNER. The reason is
 * written out for each, because "it is not copy" is exactly the excuse
 * a future unguarded generator would hide behind.
 */
const NOT_COPY: Record<string, string> = {
  "src/lib/agents/businessIntelligenceAgent.ts": "owner-facing analysis of the business's own numbers",
  "src/lib/agents/callScoringAgent.ts": "scores a recorded call for the owner; writes no copy",
  "src/lib/agents/competitorIntelAgent.ts": "research notes about other businesses, for the owner",
  "src/lib/agents/deepStrategyAgent.ts": "a long strategy document the owner reads; no published words",
  "src/lib/agents/goalPlanningAgent.ts": "turns a goal into a plan for the owner",
  "src/lib/agents/growthAdvisorAgent.ts": "growth advice for the owner to act on; writes no customer-facing words",
  "src/lib/agents/growthAdvisorV2.ts": "growth advice for the owner to act on; writes no customer-facing words",
  "src/lib/agents/optimizationAgent.ts": "suggests budget and targeting changes, not words",
  "src/lib/agents/reportingAgent.ts": "explains the owner's own report to them",
  "src/lib/agents/researchAgentV2.ts": "research for the owner; already runs guardDepartmentOutput",
  "src/lib/agents/strategyAgent.ts": "a marketing plan the owner reads and decides on",
  "src/lib/agents/pitchDeckAgent.ts": "a deck the owner presents themselves, not published copy",
  "src/lib/agents/threeDAgent.ts": "image and 3D briefs, not words a customer reads",
  "src/lib/automation/competitorMonitor.ts": "watches other businesses' pages and reports to the owner",
  "src/lib/automation/topicMonitor.ts": "watches topics and reports to the owner",
  "src/lib/strategy/channelAdvice.ts": "which channel to spend on, for the owner",
  "src/lib/strategy/positioning/analysis.ts": "positioning analysis for the owner",
  "src/lib/strategy/positioning/collect.ts": "collects public pages; writes no copy",
  "src/app/api/events/dispatch/route.ts": "dispatches events; the copy it sends was written elsewhere",
  "src/app/api/research-agent/generate/route.ts": "research for the owner",
  // MOVED HERE FROM MIGRATING, 2026-10-11, after reading it. I had
  // listed it as "ad copy pushed to live platforms", which was wrong:
  // proposeTargetingChange and proposeBudgetChange return an age range,
  // a gender list, a daily budget and an owner-facing summary. It reads
  // an existing campaign's headline and never writes one.
  "src/lib/agents/campaignEditAgent.ts": "changes targeting and budget numbers; writes no copy, only an owner-facing summary",
};

describe("every model caller is accounted for", () => {
  it("THE SWEEP FOUND THE CALLERS AT ALL", () => {
    // A broken walk would make every assertion below vacuous.
    expect(MODEL_CALLERS.length).toBeGreaterThan(30);
    expect(MODEL_CALLERS).toContain("src/lib/agents/contentMarketingAgent.ts");
    // And email is NOT here any more, because going through the door
    // means it no longer calls the model itself. That absence is the
    // migration, so it is asserted rather than assumed.
    expect(MODEL_CALLERS).not.toContain("src/lib/agents/emailMarketingAgent.ts");
  });

  it("NO FILE CALLS THE MODEL WITHOUT BEING THROUGH THE DOOR OR ON A LIST", () => {
    const stranded = MODEL_CALLERS.filter((f) => !throughTheDoor(f) && !(f in MIGRATING) && !(f in NOT_COPY));
    expect(stranded).toEqual([]);
  });

  it("A MIGRATED FILE'S ENTRY MUST BE DELETED — the backlog only shrinks", () => {
    // This is what stops the list rotting. Migrate a file and this
    // suite fails until you remove its line.
    const done = Object.keys(MIGRATING).filter((f) => throughTheDoor(f));
    expect(done).toEqual([]);
  });

  it("every listed file still exists", () => {
    // A rename would otherwise leave a stale exemption behind that
    // silently covers nothing.
    for (const f of [...Object.keys(MIGRATING), ...Object.keys(NOT_COPY)]) {
      expect(() => code(f), f).not.toThrow();
    }
  });

  it("EVERY MIGRATING ENTRY CARRIES A DATE AND A STEP", () => {
    for (const [f, reason] of Object.entries(MIGRATING)) {
      expect(reason, f).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(reason, f).toMatch(/step \d/);
    }
  });

  it("every NOT_COPY entry says who reads it", () => {
    for (const [f, reason] of Object.entries(NOT_COPY)) {
      expect(reason.length, f).toBeGreaterThan(20);
    }
  });
});

describe("email is through the door", () => {
  it("THE FIRST SURFACE, AND IT IS NOT ON EITHER LIST", () => {
    expect(throughTheDoor("src/lib/agents/emailMarketingAgent.ts")).toBe(true);
    expect("src/lib/agents/emailMarketingAgent.ts" in MIGRATING).toBe(false);
    expect("src/lib/agents/emailMarketingAgent.ts" in NOT_COPY).toBe(false);
  });

  it("AND IT NO LONGER CALLS THE MODEL ITSELF", () => {
    // Importing the door is necessary, not sufficient. Email's own
    // callClaude is gone, so there is no second path around it.
    const src = code("src/lib/agents/emailMarketingAgent.ts");
    expect(src).not.toMatch(/\bcallClaude\s*\(/);
  });

  it("A SUBSTRING IS NOT A MIGRATION", () => {
    // creativeAgent exports generateCopyVariations. If the check were a
    // substring match it would read as migrated while having no guard.
    expect(code("src/lib/agents/creativeAgent.ts")).toMatch(/generateCopyVariations/);
    expect(throughTheDoor("src/lib/agents/creativeAgent.ts")).toBe(false);
  });
});

describe("the door itself keeps its order", () => {
  const door = code("src/lib/content/generateCopy.ts");

  it("EVERY MEASURE IS INSIDE IT", () => {
    for (const measure of [
      "truthBlock",
      "onlyContentKeys",
      "isGeneric",
      "customerFirstProblem",
      "tightenOutput",
      "guardOrMark",
    ]) {
      expect(door, measure).toMatch(new RegExp(`\\b${measure}\\b`));
    }
  });

  it("THE CLAIMS GUARD RUNS AFTER THE SHAPE WORK, NOT BEFORE", () => {
    // A retry that runs after the guard would hand the model back
    // copy the guard had already cleaned and let it re-add anything.
    expect(door.indexOf("customerFirstProblem(")).toBeLessThan(door.lastIndexOf("guardOrMark("));
    expect(door.indexOf("onlyContentKeys(")).toBeLessThan(door.lastIndexOf("guardOrMark("));
  });

  it("TIGHTENING IS NOT GATED BEHIND revise", () => {
    // It is pure code. Gating it meant the unattended path could only
    // SKIP a long post, never shorten one.
    const tighten = door.indexOf("tightenOutput(");
    const reviseBlock = door.indexOf("if (shapeProblem && req.revise)");
    expect(tighten).toBeGreaterThan(reviseBlock);
    // The tighten must not sit inside that block: the closing brace of
    // the revise branch comes first.
    expect(door.slice(reviseBlock, tighten)).toMatch(/\n  \}/);
  });

  it("storyAllowed DEFAULTS TO FALSE and comes from what the owner typed", () => {
    expect(door).toMatch(/req\.storyAllowed \?\? askedForStory\(req\.topic\)/);
  });
});
