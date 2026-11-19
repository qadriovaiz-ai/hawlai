// The door that spends asks whether the account can pay — 19 November 2026.
//
// /api/ads/adlaunch refuses a dead ad account at its "LAYER 3a", and
// launching SPENDS NOTHING: launchCampaign.ts creates the campaign, the
// ad set and the ad all PAUSED. The call that actually starts the money
// is PATCH /api/ads/[id]/status, and it did not ask at all. The check
// was on the harmless door and missing from the dangerous one.
//
// The approvals route is the OTHER door onto the same spend, and it had
// the same hole. An approval granted is not an account that can pay;
// without the check the approver is told the campaign started and
// nothing delivers.
//
// THREE THINGS THIS MUST NOT DO, and each has a test below. It must not
// block pausing — the safe direction is never the slow one. It must not
// block a Google or LinkedIn activation on a Facebook account's status.
// And it must refuse BEFORE the authority gate, so nothing is queued for
// a human to approve that the account could never carry out.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const ROUTE = "src/app/api/ads/[id]/status/route.ts";
const DECIDE = "src/lib/approvals/decide.ts";

/** The activation block, sliced before anything is anchored in it. */
function activationBlock(): string {
  const src = code(ROUTE);
  const at = src.indexOf('if (status === "ACTIVE") {');
  expect(at).toBeGreaterThan(-1);
  const end = src.indexOf('if (platform === "google")', at);
  expect(end).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe("1. THE ACTIVATE ROUTE ASKS BEFORE IT SPENDS", () => {
  it("THE LOAD-BEARING ONE: it reads the account and refuses an unusable one", () => {
    const block = activationBlock();
    expect(block).toMatch(/account = await accountHealthFor\(supabase, dealershipId, \{ token \}\)/);
    expect(block).toMatch(/if \(!account\.usable\) \{/);
    expect(block).toMatch(/NextResponse\.json\(\{ error: account\.reason \}, \{ status: 400 \}\)/);
  });

  it("AND IT REFUSES BEFORE THE AUTHORITY GATE, not after", () => {
    // The gate's other branch writes a pending_approvals row. Asking a
    // manager to approve spend on an account Meta will not let spend is
    // worse than not asking: somebody reads it, approves it, and the
    // campaign still delivers nothing.
    const block = activationBlock();
    const check = block.indexOf("if (!account.usable)");
    const gate = block.indexOf("checkApprovalAuthority(");
    const queued = block.indexOf('action_type: "activate_ad_campaign"');
    expect(check).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(queued).toBeGreaterThan(-1);
    expect(check).toBeLessThan(gate);
    expect(check).toBeLessThan(queued);
  });

  it("the refusal is logged, so a blocked activation is reconstructable", () => {
    expect(activationBlock()).toMatch(/metaError\("activate\.account_unusable"/);
  });

  it("THE REASON IS META'S, not a generic refusal", () => {
    // `account.reason` carries "unsettled balance" or "disabled" — the
    // thing the owner can act on. A flat "can't activate" would send
    // them to support with nothing to say.
    const block = activationBlock();
    expect(block).toMatch(/error: account\.reason/);
    expect(block).not.toMatch(/error: "Can't activate/);
  });
});

describe("2. IT NEVER BLOCKS SWITCHING OFF", () => {
  it("THE CHECK IS INSIDE THE ACTIVE BRANCH ONLY", () => {
    // Pausing must not wait on a Graph read. A dead account is a reason
    // to pause, never a reason to refuse to — and this codebase's rule
    // is that the safe direction is not allowed to be the slow one.
    const src = code(ROUTE);
    const at = src.indexOf("accountHealthFor(supabase, dealershipId");
    const branch = src.indexOf('if (status === "ACTIVE") {');
    expect(at).toBeGreaterThan(branch);
    // And only one read in the whole route: the pause path has none.
    expect(src.match(/accountHealthFor\(/g) ?? []).toHaveLength(1);
  });

  it("AND THE PAUSE PATH PASSES null", () => {
    const src = code(ROUTE);
    const at = src.indexOf("const outcome = await setCampaignStatus(");
    expect(at).toBeGreaterThan(-1);
    // `account` is the hoisted variable, which stays null when pausing.
    expect(src.slice(at, at + 400)).toMatch(/\n\s+account,\n/);
    expect(src).toMatch(/let account: Awaited<ReturnType<typeof accountHealthFor>> \| null = null;/);
  });
});

describe("3. A FACEBOOK ACCOUNT'S STATUS IS NOT GOOGLE'S", () => {
  it("THE CHECK IS GATED ON platform === meta", () => {
    // fb_account_status says nothing about a Google Ads or LinkedIn
    // account. Refusing one of those because a Facebook ad account is
    // unsettled would be a fault of its own — this route serves five
    // platforms.
    const block = activationBlock();
    const gate = block.indexOf('if (platform === "meta") {');
    const read = block.indexOf("accountHealthFor(");
    expect(gate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(gate);
  });

  it("AND THE TOKEN IS ONLY FETCHED FOR META", () => {
    // Hoisted above the gate so the check and the flip share ONE
    // definition — two copies of the token line is how they drift.
    const src = code(ROUTE);
    expect(src).toMatch(/platform === "meta" \? \(await adsTokenFor\(supabase, dealershipId, dealership\)\) \?\? process\.env\.META_PAGE_ACCESS_TOKEN : null;/);
    expect(src.match(/await adsTokenFor\(/g) ?? []).toHaveLength(1);
  });
});

describe("4. THE APPROVALS ROUTE IS THE SAME DOOR", () => {
  /** The activate_ad_campaign branch, sliced before anchoring. */
  function activateBranch(): string {
    const src = code(DECIDE);
    const at = src.indexOf("const activation = await setCampaignStatus(");
    expect(at).toBeGreaterThan(-1);
    // Backwards to the start of the branch, so the slice is the branch
    // and not whatever precedes it.
    const start = src.lastIndexOf("const details = approval.action_details", at);
    expect(start).toBeGreaterThan(-1);
    return src.slice(start, at + 400);
  }

  it("IT CHECKS THE ACCOUNT TOO, and refuses rather than attempting", () => {
    // An activation Meta accepts and never runs is the harder state to
    // notice than a refusal, which is why this refuses.
    const branch = activateBranch();
    expect(branch).toMatch(/const account = await accountHealthFor\(service, approval\.dealership_id, \{ token \}\)/);
    expect(branch).toMatch(/if \(!account\.usable\) \{/);
    expect(branch).toMatch(/error: account\.reason/);
  });

  it("AND IT REFUSES BEFORE IT FLIPS ANYTHING", () => {
    const branch = activateBranch();
    expect(branch.indexOf("if (!account.usable)")).toBeLessThan(branch.indexOf("setCampaignStatus("));
  });

  it("the same reading is handed to setCampaignStatus, not read twice", () => {
    // Two reads could disagree, and the second would be the one the
    // verification trusts.
    const branch = activateBranch();
    expect(branch.match(/accountHealthFor\(/g) ?? []).toHaveLength(1);
    expect(branch).toMatch(/\n\s+account,\n/);
  });
});
