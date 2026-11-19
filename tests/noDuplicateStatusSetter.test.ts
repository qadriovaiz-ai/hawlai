// One function sets a campaign's status — 19 November 2026.
//
// THE LOADED GUN. There were two functions called `setCampaignStatus`.
// The real one (lib/ads/campaignStatus.ts) flips campaign → ad set → ad
// in the right order for the direction, then asks Meta what it will
// ACTUALLY do. The other (agents/campaignEditAgent.ts) POSTed status to
// the AD alone, never read effective_status, and wrote meta_status
// locally as though Meta had confirmed it.
//
// That second one is precisely the defect campaignStatus.ts documents
// replacing, surviving in a copy of the same name. Meta's own rule is
// that a paused campaign forces its children to CAMPAIGN_PAUSED, so the
// ad could report ACTIVE and deliver nothing — which is the original
// seventy-day failure.
//
// It was never lying to anyone, because its single caller only ever
// passed "PAUSED" and pausing an ad does stop that ad. That is what a
// loaded gun is: harmless until someone adds an "ACTIVE" caller.
//
// It also used the Page token, which this codebase's own note says
// cannot read campaigns or ad sets — the exact thing verifying a pause
// requires.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";

const EDIT_AGENT = "src/lib/agents/campaignEditAgent.ts";
const AUTOPILOT = "src/lib/agents/autopilotAgent.ts";
const REAL = "src/lib/ads/campaignStatus.ts";

describe("1. THE DUPLICATE IS GONE", () => {
  it("THE LOAD-BEARING ONE: campaignEditAgent no longer defines or exports it", () => {
    const src = code(EDIT_AGENT);
    expect(src).not.toMatch(/export async function setCampaignStatus/);
    expect(src).not.toMatch(/function setCampaignStatus/);
  });

  it("AND NOTHING IMPORTS A STATUS SETTER FROM IT", () => {
    // The import is how it would come back. A second definition that
    // nothing calls is dead code; a second definition something calls
    // is the bug.
    const src = code(AUTOPILOT);
    const line = src.split("\n").find((l) => l.includes("setCampaignStatus") && l.includes("import"));
    expect(line).toBeDefined();
    expect(line).toContain("@/lib/ads/campaignStatus");
    expect(line).not.toContain("campaignEditAgent");
  });

  it("THE ONLY DEFINITION IN THE REPO IS THE REAL ONE", () => {
    // Asserted against the real file rather than assumed, so this test
    // cannot pass by both of them being deleted.
    expect(code(REAL)).toMatch(/export async function setCampaignStatus\(input: \{/);
  });

  it("AND THE DELETION LEFT ITS REASON BEHIND", () => {
    // This codebase records the incident behind each guard, and a
    // removal that erases the reason invites the next person to add it
    // back. sourceWithComments, because the comment IS the assertion.
    const raw = sourceWithComments(EDIT_AGENT);
    expect(raw).toMatch(/setCampaignStatus USED TO LIVE HERE/);
    expect(raw).toMatch(/19 November 2026/);
  });
});

describe("2. AUTOPILOT NOW PAUSES THROUGH THE VERIFIED PATH", () => {
  const src = () => code(AUTOPILOT);

  /** The auto-pause call, sliced before anything is anchored in it. */
  function pauseCall(): string {
    const s = src();
    const at = s.indexOf("const outcome = await setCampaignStatus({");
    expect(at).toBeGreaterThan(-1);
    return s.slice(at, at + 500);
  }

  it("IT PASSES ALL THREE IDS, not just the ad", () => {
    // The whole point. An ad id alone cannot tell you whether the
    // campaign above it is paused.
    const call = pauseCall();
    expect(call).toMatch(/campaignId: campaign\.meta_campaign_id \?\? null/);
    expect(call).toMatch(/adsetId: campaign\.meta_adset_id \?\? null/);
    expect(call).toMatch(/adId: campaign\.meta_ad_id \?\? null/);
  });

  it("AND THE QUERY ACTUALLY FETCHES THOSE COLUMNS", () => {
    // Passing `campaign.meta_campaign_id` from a row that never
    // selected it is undefined at runtime and silently degrades to the
    // ad-only behaviour this commit removes. Sliced to the select.
    const s = src();
    const at = s.indexOf('.from("ad_creatives")');
    expect(at).toBeGreaterThan(-1);
    const select = s.slice(at, at + 400);
    expect(select).toContain("meta_adset_id");
    expect(select).toContain("meta_campaign_id");
  });

  it("IT USES THE USER TOKEN, not the Page token", () => {
    // The deleted function used readMetaPageToken. A Page token cannot
    // read campaigns or ad sets (lib/ads/metaToken.ts), which is what
    // verifying a pause needs.
    const s = src();
    expect(s).toMatch(/adsTokenFor\(supabase, dealershipId, connection\)/);
    expect(s).not.toMatch(/readMetaPageToken/);
  });

  it("THE TOKEN IS READ ONCE PER RUN, not once per campaign", () => {
    const s = src();
    const read = s.indexOf("await adsTokenFor(");
    const loop = s.indexOf("for (const rec of toPause)");
    expect(read).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(read);
  });

  it("PAUSING ASKS FOR NO ACCOUNT STATE", () => {
    // The safe direction must not be the slow one, and a dead account
    // is a reason to pause rather than a reason to refuse to.
    expect(pauseCall()).toMatch(/account: null/);
  });
});

describe("3. WHAT COUNTS AS PAUSED", () => {
  const src = () => code(AUTOPILOT);

  it("AN UNCONFIRMED PAUSE STILL COUNTS", () => {
    // Every write succeeded and only the read-back failed. Calling that
    // a failure would leave the row saying ACTIVE for a campaign that
    // has almost certainly stopped, and the cron would retry tomorrow
    // against an already-paused ad.
    expect(src()).toMatch(/const stopped = outcome\.ok \|\| outcome\.unconfirmed === true;/);
    expect(src()).toMatch(/if \(stopped\) \{/);
  });

  it("THE ROW IS WRITTEN HERE, AND ONLY AFTER META ACCEPTED", () => {
    // The deleted function wrote meta_status whether or not anything
    // had been confirmed. The write moved to the caller, behind the
    // outcome.
    const s = src();
    const stopped = s.indexOf("if (stopped) {");
    const write = s.indexOf('meta_status: "PAUSED", external_status: "PAUSED"');
    expect(stopped).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(stopped);
    expect(write - stopped).toBeLessThan(900);
  });

  it("and a campaign with no token is skipped rather than counted", () => {
    expect(src()).toMatch(/if \(!token\) continue;/);
  });
});
