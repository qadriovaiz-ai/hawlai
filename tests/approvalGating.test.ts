// Approval-first guarantees — R2.3 revenue-path coverage.
//
// WHAT THESE COVER: the policy layer that decides whether an action
// may execute directly or must wait for a human, and the role/threshold
// rules that decide who may approve. Both are pure functions, so they
// are pinned exactly rather than approximately.
//
// WHAT THESE DO NOT COVER: that every call site actually consults these
// policies. A route that bypasses getActionPolicy entirely would still
// pass every test here. Verifying enforcement at all call sites needs
// either integration tests against a live database or an audit — it is
// recorded as a gap rather than claimed as covered.

import { describe, it, expect } from "vitest";
import fs from "fs";
import { ACTION_POLICIES, getActionPolicy } from "@/lib/executionPolicy";
import { checkApprovalAuthority } from "@/lib/approvalAuthority";

describe("spend actions require approval", () => {
  it("turning ad spend ON requires approval", () => {
    // The single most expensive action in the product.
    expect(ACTION_POLICIES.activate_ad_campaign.requiresApproval).toBe(true);
    expect(ACTION_POLICIES.activate_ad_campaign.riskLevel).toBe("critical");
  });

  it("changing a live campaign budget requires approval", () => {
    expect(ACTION_POLICIES.change_campaign_budget.requiresApproval).toBe(true);
  });

  it("processing a refund is classified critical spend", () => {
    expect(ACTION_POLICIES.refund_approve.actionType).toBe("spend");
    expect(ACTION_POLICIES.refund_approve.riskLevel).toBe("critical");
  });

  it("EVERY spend-type action requires approval, with no exceptions", () => {
    // The invariant, asserted over the whole table rather than the
    // three actions that exist today — so a spend action added later
    // without requiresApproval fails here instead of in production.
    for (const [key, policy] of Object.entries(ACTION_POLICIES)) {
      if (policy.actionType === "spend") {
        expect(policy.requiresApproval, `${key} is a spend action but does not require approval`).toBe(true);
      }
    }
  });

  it("has exactly one documented publish-without-approval exception", () => {
    const publishExceptions = Object.entries(ACTION_POLICIES)
      .filter(([, p]) => p.actionType === "publish" && !p.requiresApproval)
      .map(([key]) => key);
    // content_autopilot_enabled is the single documented exception,
    // gated by an explicit opt-in rather than per-run approval. A
    // SECOND such exception appearing is a policy change that should
    // be deliberate, not incidental.
    expect(publishExceptions).toEqual(["content_autopilot_publish"]);
  });
});

describe("launching versus activating", () => {
  it("launching a campaign does not itself require approval", () => {
    // Because launch creates the campaign PAUSED — real resources and
    // real AI cost, but zero spend. See the source assertion below.
    expect(ACTION_POLICIES.ad_campaign_launch.requiresApproval).toBe(false);
  });

  it("the launch/activate split is what makes that safe", () => {
    // These two policies only make sense as a pair: launch is
    // unapproved ONLY because activation is separately gated.
    expect(ACTION_POLICIES.ad_campaign_launch.actionType).toBe("create");
    expect(ACTION_POLICIES.activate_ad_campaign.actionType).toBe("spend");
    expect(ACTION_POLICIES.activate_ad_campaign.requiresApproval).toBe(true);
  });

  it("reversible automatic actions are not approval-gated", () => {
    // Auto-pausing spends nothing and can be undone.
    expect(ACTION_POLICIES.auto_paused_campaign.requiresApproval).toBe(false);
    expect(ACTION_POLICIES.auto_paused_campaign.riskLevel).toBe("low");
  });
});

describe("PAUSED-on-create guarantee", () => {
  it("the ad launch route creates campaigns PAUSED, never ACTIVE", () => {
    // A SOURCE-LEVEL assertion, and deliberately labelled as one.
    //
    // The route is a long handler over Supabase and the Meta Graph
    // API; exercising it properly needs both mocked, and a mock built
    // from my own assumptions would mostly re-assert those. What
    // actually matters is one line: the campaign creation payload must
    // say PAUSED. If someone changes it to ACTIVE, real money starts
    // moving with no approval anywhere in the flow.
    //
    // This catches exactly that edit. It does not verify the route
    // works.
    const source = fs.readFileSync("src/app/api/ads/adlaunch/route.ts", "utf8");
    expect(source).toContain('status: "PAUSED"');
    expect(source).not.toContain('status: "ACTIVE"');
  });
});

describe("policy lookup", () => {
  it("returns null for an unknown action rather than a permissive default", () => {
    // Callers must handle "no policy" explicitly; inventing a
    // permissive default would silently allow unclassified actions.
    expect(getActionPolicy("some_action_that_does_not_exist")).toBeNull();
  });

  it("resolves every declared action", () => {
    for (const key of Object.keys(ACTION_POLICIES)) {
      expect(getActionPolicy(key)).not.toBeNull();
    }
  });
});

describe("who may approve", () => {
  it("owners and admins can approve anything", () => {
    expect(checkApprovalAuthority("owner", 10000, 500000).canApprove).toBe(true);
    expect(checkApprovalAuthority("admin", 10000, 500000).canApprove).toBe(true);
  });

  it("a marketing manager can approve within their limit", () => {
    expect(checkApprovalAuthority("marketing_manager", 10000, 5000).canApprove).toBe(true);
  });

  it("a marketing manager cannot approve above their limit", () => {
    const result = checkApprovalAuthority("marketing_manager", 10000, 50000);
    expect(result.canApprove).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("treats the threshold as inclusive", () => {
    // An amount exactly at the limit is within it — off-by-one here
    // would block routine approvals at round numbers.
    expect(checkApprovalAuthority("marketing_manager", 10000, 10000).canApprove).toBe(true);
  });

  it("lets a marketing manager approve non-monetary actions", () => {
    expect(checkApprovalAuthority("marketing_manager", 10000, null).canApprove).toBe(true);
  });

  it("denies every role without approval authority", () => {
    for (const role of ["designer", "content_writer", "sales", "viewer"] as const) {
      const result = checkApprovalAuthority(role, 10000, 100);
      expect(result.canApprove, `${role} should not be able to approve`).toBe(false);
      expect(result.reason).toBeTruthy();
    }
  });

  it("denies a viewer even for a zero-value action", () => {
    expect(checkApprovalAuthority("viewer", 10000, 0).canApprove).toBe(false);
  });

  it("denies a viewer even for a non-monetary action", () => {
    // null amount is a shortcut for marketing managers only — it must
    // not become a hole for roles with no authority at all.
    expect(checkApprovalAuthority("viewer", 10000, null).canApprove).toBe(false);
  });
});
