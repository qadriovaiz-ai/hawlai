// No new test greps source without stripping comments first.
//
// THE INCIDENT (2026-10-09). Two tests asserting that taskExecutors.ts
// does NOT pass `revise: true` failed, because the comment above that
// call says those words while explaining that it is deliberately not
// passed. A source-grep test is defeated by a comment ABOUT the thing it
// looks for.
//
// That direction is harmless — a present guard looks absent and the test
// goes red. THE REVERSE IS WHY THIS FILE EXISTS: a test asserting a
// guard IS present passes on a comment that merely mentions it, so a
// guard deleted from the code but still described above it reads as
// protected. Nothing would go red.
//
// MEASURED when this was written: 82 test files read source from disk
// and make 1128 toMatch/toContain assertions between them. Reading
// which of those are genuinely foolable needs judgement, not a sweep —
// so they are allowlisted with a date and a migration priority rather
// than migrated blind or left unmentioned.
//
// AN EARLIER COUNT IN CLAUDE.md SAID 39 FILES AND 140 ASSERTIONS. That
// was wrong: the sweep behind it matched assertions only on a handful of
// variable names (src, code, brain…) and missed every file using another
// one. Corrected here and in CLAUDE.md.
//
// THE RULE GOING FORWARD: a test that reads source imports `code()` from
// tests/helpers/source.ts. Nothing new goes on the list.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Allow = {
  file: string;
  /** When it was allowlisted, so the backlog has an age. */
  since: string;
  /**
   * Which pass migrates it. "high" is where a comment making a missing
   * guard look present would matter most: approval, claims, auth,
   * consent, token and boundary tests.
   */
  priority: "high" | "normal";
  why: string;
};

// ---------------------------------------------------------------------
// HIGH PRIORITY — approval, claims, auth, consent, tokens, boundaries.
// These get migrated first, by Ovaiz's instruction (2026-10-09).
// ---------------------------------------------------------------------
const ALLOWED: Allow[] = [
  { file: "tests/approvalCardState.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 7 source assertions, not yet read individually" },
  { file: "tests/approvalCoverage.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 17 source assertions, not yet read individually" },
  { file: "tests/approvalGating.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 2 source assertions, not yet read individually" },
  { file: "tests/autoReplyGuard.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 30 source assertions, not yet read individually" },
  { file: "tests/bookingConsent.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 3 source assertions, not yet read individually" },
  { file: "tests/claimsReviewLiveCard.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 9 source assertions, not yet read individually" },
  { file: "tests/claimsReviewProductionShape.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 21 source assertions, not yet read individually" },
  { file: "tests/clientBoundary.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 4 source assertions, not yet read individually" },
  { file: "tests/clientBundleBoundary.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 1 source assertions, not yet read individually" },
  { file: "tests/customerStoryConsent.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 28 source assertions, not yet read individually" },
  { file: "tests/errorBoundary.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 8 source assertions, not yet read individually" },
  { file: "tests/inventedContacts.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 21 source assertions, not yet read individually" },
  { file: "tests/metaTokenEncryption.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 5 source assertions, not yet read individually" },
  { file: "tests/paidAdsClaims.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 13 source assertions, not yet read individually" },
  { file: "tests/razorpayOrders.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 3 source assertions, not yet read individually" },
  { file: "tests/resendWebhook.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 2 source assertions, not yet read individually" },
  { file: "tests/retargetingAudienceToken.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 6 source assertions, not yet read individually" },
  { file: "tests/retargetingClaims.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 17 source assertions, not yet read individually" },
  { file: "tests/searchCaps.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 4 source assertions, not yet read individually" },
  { file: "tests/searchConsolePrivacy.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 4 source assertions, not yet read individually" },
  { file: "tests/seoAuditAndClaims.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 15 source assertions, not yet read individually" },
  { file: "tests/seoClaimsGuard.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 13 source assertions, not yet read individually" },
  { file: "tests/siteClaimsReview.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 38 source assertions, not yet read individually" },
  { file: "tests/usageLogging.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 11 source assertions, not yet read individually" },
  { file: "tests/websiteBuilderClaims.test.ts", since: "2026-10-09", priority: "high", why: "pre-dates the helper; 8 source assertions, not yet read individually" },

// ---------------------------------------------------------------------
// NORMAL PRIORITY — everything else.
// ---------------------------------------------------------------------
  { file: "tests/brandPillars.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 7 source assertions, not yet read individually" },
  { file: "tests/budgetProse.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 11 source assertions, not yet read individually" },
  { file: "tests/businessModel.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 8 source assertions, not yet read individually" },
  { file: "tests/campaignLookup.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 4 source assertions, not yet read individually" },
  { file: "tests/catalogServices.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 27 source assertions, not yet read individually" },
  { file: "tests/channelAdviceSignals.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 17 source assertions, not yet read individually" },
  { file: "tests/channelRules.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 9 source assertions, not yet read individually" },
  { file: "tests/chatLanguage.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 18 source assertions, not yet read individually" },
  { file: "tests/chatPageEditing.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 64 source assertions, not yet read individually" },
  { file: "tests/claudeClient.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 5 source assertions, not yet read individually" },
  { file: "tests/competitorCitations.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 25 source assertions, not yet read individually" },
  { file: "tests/competitorTiers.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 14 source assertions, not yet read individually" },
  { file: "tests/contentQuality.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 78 source assertions, not yet read individually" },
  { file: "tests/contentSourceScope.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 6 source assertions, not yet read individually" },
  { file: "tests/dailyRunGroups.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 14 source assertions, not yet read individually" },
  { file: "tests/dailyRunOrder.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 7 source assertions, not yet read individually" },
  { file: "tests/envExample.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 6 source assertions, not yet read individually" },
  { file: "tests/festivalAnglesByModel.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 9 source assertions, not yet read individually" },
  { file: "tests/festiveTopic.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 6 source assertions, not yet read individually" },
  { file: "tests/generatedProductPhoto.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 9 source assertions, not yet read individually" },
  { file: "tests/healthScoreAndVerdicts.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 37 source assertions, not yet read individually" },
  { file: "tests/leadProfile.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 11 source assertions, not yet read individually" },
  { file: "tests/metaTargetingGeo.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 4 source assertions, not yet read individually" },
  { file: "tests/modelJsonRecovery.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 26 source assertions, not yet read individually" },
  { file: "tests/multiTenantVocabulary.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 18 source assertions, not yet read individually" },
  { file: "tests/outOfSeasonCheck.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 1 source assertions, not yet read individually" },
  { file: "tests/ownerVisits.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 16 source assertions, not yet read individually" },
  { file: "tests/pageMetaEndToEnd.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 18 source assertions, not yet read individually" },
  { file: "tests/pageMetaTool.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 20 source assertions, not yet read individually" },
  { file: "tests/performanceBrain.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 20 source assertions, not yet read individually" },
  { file: "tests/planBudgetSurface.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 25 source assertions, not yet read individually" },
  { file: "tests/positioningSurfaces.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 14 source assertions, not yet read individually" },
  { file: "tests/preferredLanguage.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 25 source assertions, not yet read individually" },
  { file: "tests/promptCaching.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 11 source assertions, not yet read individually" },
  { file: "tests/researchPageReplaced.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 9 source assertions, not yet read individually" },
  { file: "tests/researchProvenance.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 16 source assertions, not yet read individually" },
  { file: "tests/retargetingAudiencesByModel.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 4 source assertions, not yet read individually" },
  { file: "tests/retargetingResults.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 7 source assertions, not yet read individually" },
  { file: "tests/retargetingSequence.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 22 source assertions, not yet read individually" },
  { file: "tests/scheduledExport.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 6 source assertions, not yet read individually" },
  { file: "tests/searchConsoleActions.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 32 source assertions, not yet read individually" },
  { file: "tests/searchConsoleConnect.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 11 source assertions, not yet read individually" },
  { file: "tests/searchQueries.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 21 source assertions, not yet read individually" },
  { file: "tests/seasonalCalendar.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 19 source assertions, not yet read individually" },
  { file: "tests/seoOwnerWords.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 18 source assertions, not yet read individually" },
  { file: "tests/shortStaysSpecific.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 16 source assertions, not yet read individually" },
  { file: "tests/smoke/routeSmoke.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 1 source assertions, not yet read individually" },
  { file: "tests/storefrontMetadata.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 7 source assertions, not yet read individually" },
  { file: "tests/strategyCalendar.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 11 source assertions, not yet read individually" },
  { file: "tests/strategyPillarsAccept.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 7 source assertions, not yet read individually" },
  { file: "tests/strategyQuarterReview.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 5 source assertions, not yet read individually" },
  { file: "tests/strategySignals.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 7 source assertions, not yet read individually" },
  { file: "tests/suiteTimeouts.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 3 source assertions, not yet read individually" },
  { file: "tests/testAndMergedLeads.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 5 source assertions, not yet read individually" },
  { file: "tests/watchLimits.test.ts", since: "2026-10-09", priority: "normal", why: "pre-dates the helper; 12 source assertions, not yet read individually" },
];

/** Every test file, so a new one cannot appear unnoticed. */
function testFiles(dir = "tests"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...testFiles(path));
    else if (entry.endsWith(".test.ts")) out.push(path.split("\\").join("/"));
  }
  return out;
}

/** Does this file read source from disk AND assert on what it finds? */
function grepsSource(src: string): boolean {
  if (!/readFileSync|readFile\(/.test(src)) return false;
  return /\.(?:toMatch|toContain)\(/.test(src);
}

const usesHelper = (src: string) => /helpers\/source/.test(src);

describe("a source-grep test strips comments first", () => {
  const files = testFiles();

  it("scans a real number of test files", () => {
    // A path mistake that silently scanned nothing would make every
    // assertion below pass — the same failure this whole file is about.
    expect(files.length).toBeGreaterThan(200);
  });

  it("NO NEW TEST GREPS SOURCE WITHOUT code()", () => {
    const offenders: string[] = [];
    for (const path of files) {
      if (path.endsWith("tests/sourceGrepDiscipline.test.ts")) continue;
      const src = readFileSync(path, "utf8");
      if (!grepsSource(src) || usesHelper(src)) continue;
      if (ALLOWED.some((a) => a.file === path)) continue;
      offenders.push(path);
    }
    expect(
      offenders,
      `These read source and assert on it without stripping comments.\n\nImport code() from tests/helpers/source.ts:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("every allowlist entry still exists", () => {
    // An allowlist that outlives its files is how the real list gets
    // lost in the noise.
    for (const entry of ALLOWED) {
      expect(files, `allowlisted but gone: ${entry.file}`).toContain(entry.file);
    }
  });

  it("A MIGRATED FILE MUST LEAVE THE ALLOWLIST", () => {
    // This is what makes the backlog shrink visibly instead of rotting.
    // Migrate a file to code() and this fails until its entry is deleted.
    const stale = ALLOWED.filter((a) => usesHelper(readFileSync(a.file, "utf8")));
    expect(
      stale.map((s) => s.file),
      "These now use code() and should be removed from ALLOWED"
    ).toEqual([]);
  });

  it("every entry carries a reason and a date", () => {
    for (const entry of ALLOWED) {
      expect(entry.why.length, `needs a reason: ${entry.file}`).toBeGreaterThan(20);
      expect(entry.since, `needs a date: ${entry.file}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the backlog's size is stated, so it cannot quietly grow", () => {
    // Not a cap on the codebase — a cap on THIS list. It may shrink; it
    // may not grow.
    expect(ALLOWED.length).toBeLessThanOrEqual(82);
    expect(ALLOWED.filter((a) => a.priority === "high").length).toBeLessThanOrEqual(27);
  });
});
