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
 * Surfaces that use the CHECKS half of the door without its generation.
 *
 * guardCopyFields runs the same checks in the same order with no model
 * call. It exists for one real case: a surface whose model call is a
 * structured extraction rather than prose generation, so the door
 * cannot write it.
 *
 * THIS LIST IS COUNTED AND EXPLAINED so it cannot become a quiet escape
 * hatch. A surface that calls the model to write prose belongs in the
 * door, not here, and the count is asserted below — adding an entry
 * fails the suite until the number is changed on purpose.
 */
const CHECKS_ONLY: Record<string, string> = {
  "src/lib/adEngine.ts":
    "its one model call extracts headline, body, budget, city and an image scene together, with its own self-critique retry loop; the door cannot write that shape",
};

/** Uses the checks half, and is on the list that says why. */
function checksOnly(file: string): boolean {
  if (!(file in CHECKS_ONLY)) return false;
  const src = code(file);
  return /\bguardCopyFields\b\s*\(/.test(src) && /from\s+"@\/lib\/content\/generateCopy"/.test(src);
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
  // step 4 — DONE 2026-10-11. WhatsApp and the CUSTOMER-FACING social
  // tasks are through the door. socialManagementAgent still calls the
  // model directly for viral_trends, which searches the web and is
  // research for the owner, and for the owner-facing tasks whose
  // guidance the copy guard would strip ("post three times a week").
  // step 5 — DONE 2026-10-11. paidAdsAgent (its customer-facing
  // ad_copy task), retargetingAgent and adEngine. adEngine uses
  // guardCopyFields rather than the whole door: its model call is a
  // structured extraction with its own self-critique retry, so the door
  // cannot write it, but the order of the checks afterwards is the
  // door's. paidAdsAgent still calls the model directly for its
  // owner-facing planning tasks.
  // step 6 — SEO, AEO and CRO
  "src/lib/agents/seoToolkitAgent.ts": "2026-10-11, step 6. HAS: guardOrMark, claims and provenance, and its F-01 fail-open was fixed today. MISSING: the genericness verdict and the key strip for its two customer-facing tasks, meta_tags and gbp_optimization. The other eight tasks are owner-facing SEO advice and must not go through the door",
  // step 7 — websites and long-form shapes
  "src/lib/agents/websiteBuilderAgent.ts": "2026-10-11, step 7. HAS: guardBlockTree, which runs claims and provenance over every block's text, plus its own invented-contact scrub and slug check. MISSING: the genericness verdict. The door writes a JSON piece; this writes a tree of typed blocks, so a block-aware door is a design decision for the owner rather than a mechanical move",
  "src/lib/agents/brandBuildingAgent.ts": "2026-10-11, step 7. HAS: guardDepartmentOutput, so claims and provenance run over the taglines and positioning lines. MISSING: the genericness verdict, which is the measure that matters most for a tagline - and the one case where a fixed word cap would be wrong",
  // the chat, which writes prose of its own
  "src/lib/agents/chatbotAgent.ts": "2026-10-11, step 4. HAS: truthBlock in the prompt, then stripUnsupported with the records and stripUnverifiable without them, so claims, links and provenance all run. MISSING: nothing mechanical. A chat turn is not a marketing piece, so the cap and the customer-first order do not apply, and whether a visitor-facing reply should also get the genericness verdict is an open question for the owner",
  // the calendar writes post drafts
};

/**
 * Not customer-facing copy.
 *
 * These analyse, score, plan or research FOR THE OWNER. The reason is
 * written out for each, because "it is not copy" is exactly the excuse
 * a future unguarded generator would hide behind.
 */
const NOT_COPY: Record<string, string> = {
  // C2 step 4a, added 2026-10-16. THE OPPOSITE OF A GENERATOR: it is
  // given finished copy and reports the claims that copy makes, in
  // English canonical form, so the entailment step can check them
  // against records. It writes nothing a customer ever reads, and it is
  // deliberately given NO records, so there is nothing for the copy
  // guard to check it against. Putting it through the door would run
  // the claim layer over a LIST OF CLAIMS and strip them — the guard
  // would delete the verifier's findings.
  "src/lib/facts/extractClaims.ts":
    "reads finished copy and lists the claims it makes, for the verifier; writes no customer-facing words and is given no records",
  // C2 step 1, added 2026-10-16. Chooses WHICH records the copy will
  // state and cites them by id. It returns a list of claims, conflicts
  // and unknowns — no prose, nothing a customer reads. The writing
  // happens inside generateCopy itself, which IS the door, so the step
  // that produces words is not on this list.
  "src/lib/facts/selectClaims.ts":
    "chooses which records a piece will state and cites them by id; returns claims, conflicts and unknowns, never prose",
  // C2 step 4b, added 2026-10-16. Given finished copy's claims and the
  // approved facts, it returns a verdict per claim. No figure ever
  // reaches it as a question - prices, offers, shipping, durations and
  // counts are decided by arithmetic, and only questions of MEANING are
  // asked of the model.
  "src/lib/facts/verifyClaims.ts":
    "decides whether each claim the copy makes is supported; returns verdicts, writes no words, and judges no figures",
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
  // BOTH MOVED HERE FROM MIGRATING, 2026-10-11, after reading them.
  //
  // aeoAgent: I had listed it as "published answers". It is not - it
  // runs a web search and returns a visibility SCORE, a breakdown,
  // which competitors were mentioned, and recommendations. A check, for
  // the owner.
  //
  // croAgentV2: I had listed it as unguarded. It is not - scrubCroOutput
  // calls findUnsupportedClaims, so it already gets every claim rule
  // including the comparative, performance and benefit classes enabled
  // on 2026-10-11, and it drops a whole suggestion rather than half of
  // one.
  "src/lib/agents/aeoAgent.ts": "a visibility check for the owner: a score, a breakdown and recommendations, built from a web search; writes no copy",
  "src/lib/agents/croAgentV2.ts": "conversion suggestions for the owner, already scrubbed by scrubCroOutput which runs findUnsupportedClaims",
  // CORRECTED 2026-10-11. I listed this as "reports claims but does not
  // strip". It does strip: findUnsupportedClaims on each idea, and an
  // idea with an unsupported claim is DROPPED whole with a reason. The
  // ideas are week-by-week planning for the owner, who turns a chosen
  // one into a post through a generator that is through the door.
  "src/lib/strategy/calendar/write.ts": "week-by-week content ideas for the owner to pick from; each idea is dropped whole if findUnsupportedClaims flags it",
  // The chat talks to the OWNER, not to their customers, and its prose
  // is already guarded by lib/chat/replyClaims.ts (claims, links,
  // language and provenance). It is not a marketing piece, so the word
  // cap and the customer-first order do not apply to it.
  "src/lib/agents/masterBrainV2.ts": "the chat's replies, read by the owner; already guarded by replyClaims, and not a marketing piece with a shape or a cap",
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
    const stranded = MODEL_CALLERS.filter(
      (f) => !throughTheDoor(f) && !checksOnly(f) && !(f in MIGRATING) && !(f in NOT_COPY)
    );
    expect(stranded).toEqual([]);
  });

  it("A MIGRATED FILE'S ENTRY MUST BE DELETED — the backlog only shrinks", () => {
    // This is what stops the list rotting. Migrate a file and this
    // suite fails until you remove its line.
    const done = Object.keys(MIGRATING).filter((f) => throughTheDoor(f));
    expect(done).toEqual([]);
  });

  it("THE CHECKS-ONLY LIST IS ONE ENTRY LONG — it is not an escape hatch", () => {
    // Growing this list is a decision, not a convenience. Changing the
    // number is the moment to ask whether the surface could use the
    // whole door instead.
    expect(Object.keys(CHECKS_ONLY)).toEqual(["src/lib/adEngine.ts"]);
    for (const [f, why] of Object.entries(CHECKS_ONLY)) {
      expect(why.length, f).toBeGreaterThan(40);
      // And it must actually use it, not merely be listed.
      expect(checksOnly(f), f).toBe(true);
    }
  });

  it("every listed file still exists", () => {
    // A rename would otherwise leave a stale exemption behind that
    // silently covers nothing.
    for (const f of [...Object.keys(MIGRATING), ...Object.keys(NOT_COPY), ...Object.keys(CHECKS_ONLY)]) {
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
    // THE HAZARD, which was real: creativeAgent exported
    // generateCopyVariations, and a substring match would have read it
    // as migrated while it had no guard at all.
    //
    // creativeAgent went through the door in step 7, so it can no
    // longer demonstrate this. tests/fixtures/substringNotAMigration.txt
    // can, permanently: it contains the substring and imports nothing.
    const fixture = code("tests/fixtures/substringNotAMigration.txt");
    expect(fixture).toMatch(/generateCopyVariations/);
    expect(fixture).toContain("generateCopy");
    expect(throughTheDoor("tests/fixtures/substringNotAMigration.txt")).toBe(false);
  });

  it("AND THE IMPORT IS WHAT DECIDES — creativeAgent has both now", () => {
    // The positive control for the same rule: the same substring, plus
    // the import, plus a real call.
    expect(code("src/lib/agents/creativeAgent.ts")).toMatch(/generateCopyVariations/);
    expect(throughTheDoor("src/lib/agents/creativeAgent.ts")).toBe(true);
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
