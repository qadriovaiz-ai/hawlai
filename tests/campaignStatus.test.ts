// Turning a campaign on, and proving it turned on.
//
// THE BUG: the activate path POSTed status "ACTIVE" to the AD and
// nothing else. Meta accepted it, returned success, and the dashboard
// showed ACTIVE — while the campaign and ad set from the launch flow
// were still PAUSED. Meta's own docs:
//
//   "If this status is PAUSED, all its active ad sets and ads will be
//    paused and have an effective status CAMPAIGN_PAUSED."
//
// So the ad's configured status said ACTIVE, its effective_status said
// CAMPAIGN_PAUSED, and it delivered nothing. STATUS IS NOT
// EFFECTIVE_STATUS: the first is what you asked for, the second is what
// Meta will do. Writing the first and reporting success is the same
// class of failure as an unchecked database error.

import { describe, it, expect, vi, afterEach } from "vitest";
import { setCampaignStatus, readEffectiveStatus } from "@/lib/ads/campaignStatus";

afterEach(() => vi.unstubAllGlobals());

const OBJECTS = { campaignId: "120254652336640260", adsetId: "120254652336770260", adId: "120254652337290260" };

/**
 * Records every POST, and answers every GET the way Graph does: each
 * level reports its status, and the ad also names its parents. Every
 * level reports the same effective status unless a test sets one per
 * node.
 */
function meta(opts: {
  effective?: string;
  failOn?: string;
  verifyFails?: boolean;
  verifyFailsAfterFlip?: boolean;
  states?: Record<string, Record<string, any>>;
} = {}) {
  const posts: { node: string; status: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: any) => {
    const node = String(url).split("/v23.0/")[1].split("?")[0];
    if (!init || init.method !== "POST") {
      if (opts.verifyFails || (opts.verifyFailsAfterFlip && posts.length > 0)) {
        return { ok: false, status: 500, json: async () => ({ error: { message: "down" } }) };
      }
      const base = { id: node, effective_status: opts.effective ?? "ACTIVE", status: "ACTIVE", campaign_id: OBJECTS.campaignId, adset_id: OBJECTS.adsetId };
      return { ok: true, status: 200, json: async () => ({ ...base, ...(opts.states?.[node] ?? {}) }) };
    }
    const body = JSON.parse(init.body);
    if (opts.failOn && node === opts.failOn) {
      return { ok: false, status: 400, json: async () => ({ error: { message: "Invalid parameter", error_subcode: 1234 } }) };
    }
    posts.push({ node, status: body.status });
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { posts };
}

describe("all three levels are flipped, in the right order", () => {
  it("activates campaign then ad set then ad, parents first", async () => {
    // A child cannot deliver while a parent is paused. Doing it the
    // other way leaves a window where the ad is "active" under a paused
    // parent — the exact state this exists to prevent.
    const m = meta({ effective: "ACTIVE" });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });

    expect(r.ok).toBe(true);
    expect(m.posts.map((p) => p.node)).toEqual([OBJECTS.campaignId, OBJECTS.adsetId, OBJECTS.adId]);
    expect(m.posts.every((p) => p.status === "ACTIVE")).toBe(true);
  });

  it("does NOT flip only the ad — the whole bug in one assertion", async () => {
    const m = meta({ effective: "ACTIVE" });
    await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(m.posts.length, "only the ad was flipped, so the parents stay paused").toBe(3);
  });

  it("pauses all three too, so the record is unambiguous", async () => {
    const m = meta({ effective: "PAUSED" });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "PAUSED" });
    expect(r.ok).toBe(true);
    expect(m.posts.every((p) => p.status === "PAUSED")).toBe(true);
    expect(m.posts.length).toBe(3);
  });

  it("still works for an older row that only stored an ad id", async () => {
    const m = meta({ effective: "ACTIVE" });
    const r = await setCampaignStatus({ objects: { campaignId: null, adsetId: null, adId: "ad_1" }, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(true);
    expect(m.posts.map((p) => p.node)).toEqual(["ad_1"]);
  });

  it("refuses when there is no ad on Meta at all", async () => {
    meta();
    const r = await setCampaignStatus({ objects: { campaignId: null, adsetId: null, adId: null }, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/created on Meta/i);
  });
});

describe("effective_status is verified, not assumed", () => {
  it("FAILS when Meta accepts every flip but the ad still will not run", async () => {
    // THE ORIGINAL FAILURE, now caught. Every POST succeeds; Meta then
    // reports CAMPAIGN_PAUSED. Previously this was reported as success.
    const m = meta({ effective: "CAMPAIGN_PAUSED" });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });

    expect(m.posts.length).toBe(3);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.effectiveStatus).toBe("CAMPAIGN_PAUSED");
  });

  it("names the reason in words, not as a Meta enum", async () => {
    meta({ effective: "CAMPAIGN_PAUSED" });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(!r.ok && r.reason).toMatch(/campaign above it is still paused/i);
    expect(!r.ok && r.reason).toMatch(/nothing is being spent/i);
  });

  it.each([
    ["PENDING_REVIEW", /still reviewing/i],
    ["DISAPPROVED", /rejected the ad/i],
    ["PENDING_BILLING_INFO", /billing details/i],
    ["ADSET_PAUSED", /ad set above it/i],
    ["WITH_ISSUES", /flagged an issue/i],
  ])("explains %s rather than passing the code through", async (effective, expected) => {
    meta({ effective });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(expected);
  });

  it("treats an UNKNOWN effective status as not running, rather than assuming it is", async () => {
    // A state Meta adds later must not be read as success by default.
    meta({ effective: "SOME_NEW_META_STATE" });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
  });

  it("refuses to switch anything on when Meta's current state can't be read first", async () => {
    const m = meta({ verifyFails: true });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(m.posts).toEqual([]);
    expect(!r.ok && r.reason).toMatch(/couldn't read/i);
  });

  it("a start Meta accepted but that can't be read back is UNCONFIRMED — not success, not 'nothing happened'", async () => {
    // "We sent it and cannot confirm" is not success. But every write
    // was accepted, so the campaign may already be spending, and saying
    // it failed would be just as false.
    meta({ verifyFailsAfterFlip: true });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.unconfirmed).toBe(true);
    expect(!r.ok && r.reason).toMatch(/accepted the start request/i);
    expect(!r.ok && r.reason).toMatch(/may already be spending/i);
  });

  it("accepts a genuine pause, where a paused effective status IS the goal", async () => {
    meta({ effective: "CAMPAIGN_PAUSED" });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "PAUSED" });
    expect(r.ok).toBe(true);
  });

  it("fails a pause that did not take", async () => {
    meta({ effective: "ACTIVE" });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "PAUSED" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/still shows as running/i);
  });
});

describe("the ids on file must be one real campaign on Meta", () => {
  // A hand-repaired row, beside duplicate campaigns left on Meta by
  // launches whose local save failed, can point at an ad under a
  // DIFFERENT campaign. Flipping would start this campaign's parents
  // and somebody else's ad.
  it("refuses to switch anything on when the ad sits under another campaign", async () => {
    const m = meta({ states: { [OBJECTS.adId]: { campaign_id: "120254999999999999" } } });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/different campaign/i);
    expect(m.posts).toEqual([]);
  });

  it("…or under another ad set", async () => {
    const m = meta({ states: { [OBJECTS.adId]: { adset_id: "120254999999999998" } } });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(m.posts).toEqual([]);
  });

  it("an ad that reports ACTIVE is not enough: a paused campaign above it means not running", async () => {
    // "Running" means every level says so, not one of them.
    meta({ states: { [OBJECTS.campaignId]: { status: "PAUSED", effective_status: "PAUSED" } } });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/campaign above it is still paused/i);
  });
});

describe("a level that refuses to flip is named", () => {
  it.each([
    ["campaign", OBJECTS.campaignId],
    ["adset", OBJECTS.adsetId],
    ["ad", OBJECTS.adId],
  ])("says which level failed when %s is rejected", async (level, node) => {
    // "Meta rejected the change" tells nobody which of three objects
    // refused, or why.
    meta({ failOn: node });
    const r = await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain(level);
    expect(!r.ok && r.reason).toContain("Invalid parameter");
  });

  it("stops at the first failure rather than half-flipping the rest", async () => {
    const m = meta({ failOn: OBJECTS.campaignId });
    await setCampaignStatus({ objects: OBJECTS, token: "T", status: "ACTIVE" });
    expect(m.posts).toEqual([]);
  });
});

describe("readEffectiveStatus", () => {
  it("returns null rather than throwing when Meta is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await readEffectiveStatus("ad_1", "T")).toBeNull();
  });
});
