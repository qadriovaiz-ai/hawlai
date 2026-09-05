// A critical action with no rupee amount needs the owner.
//
// THE GAP THIS CLOSES. checkApprovalAuthority treated "amount is
// null" as "not money related, therefore routine" and let a marketing
// manager approve it. That reasoning is right for pausing a campaign
// and wrong for changing a live price: a price change carries no
// amount of its own and unbounded revenue consequence, so the
// threshold has nothing to measure it against.
//
// A null amount is not evidence of low stakes — it is the ABSENCE of
// evidence. Where the threshold cannot bound the risk, the decision
// goes up.
//
// Found while writing up the publish_actions design for review, not
// by a failure: requiresApproval: true was already true for price
// changes, and would have been satisfied by a marketing manager
// clicking approve. The gate was present and the authority behind it
// was wrong.

import { describe, it, expect } from "vitest";
import { checkApprovalAuthority } from "@/lib/approvalAuthority";
import { ACTION_POLICIES } from "@/lib/executionPolicy";

const THRESHOLD = 50_000;

describe("critical no-amount actions escalate to owner/admin", () => {
  it("a marketing manager CANNOT approve a price change", () => {
    // THE LOAD-BEARING ONE.
    const result = checkApprovalAuthority("marketing_manager", THRESHOLD, null, "update_product_price");
    expect(result.canApprove).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("the owner and an admin still can", () => {
    expect(checkApprovalAuthority("owner", THRESHOLD, null, "update_product_price").canApprove).toBe(true);
    expect(checkApprovalAuthority("admin", THRESHOLD, null, "update_product_price").canApprove).toBe(true);
  });

  it("the reason does not talk about a rupee limit", () => {
    // The old message ("above your ₹50,000 approval limit") would be
    // actively misleading here — there is no amount, so a manager
    // would reasonably conclude a cheaper change was fine.
    const result = checkApprovalAuthority("marketing_manager", THRESHOLD, null, "update_product_price");
    expect(result.reason).not.toMatch(/₹|limit/);
  });
});

describe("the rule is scoped, not a blanket tightening", () => {
  it("a HIGH-risk no-amount action stays within routine authority", () => {
    // publish_post is high, not critical. Publishing a post is a
    // marketing manager's job, and escalating it would make the
    // approval queue useless by putting everything in it.
    expect(ACTION_POLICIES.publish_post.riskLevel).toBe("high");
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, null, "publish_post").canApprove).toBe(true);
  });

  it("pausing a campaign is still routine", () => {
    // The original null-amount case, unchanged. This is what the
    // "null means routine" rule was written for and it remains right.
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, null, "auto_paused_campaign").canApprove).toBe(true);
  });

  it("critical actions WITH an amount behave exactly as before", () => {
    // activate_ad_campaign is critical and carries a rupee amount, so
    // the threshold CAN bound it. Deliberately untouched — changing
    // it would be a behaviour change nobody asked for.
    expect(ACTION_POLICIES.activate_ad_campaign.riskLevel).toBe("critical");
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, 10_000, "activate_ad_campaign").canApprove).toBe(true);
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, 90_000, "activate_ad_campaign").canApprove).toBe(false);
  });

  it("omitting actionKey preserves the old behaviour exactly", () => {
    // Every existing call site passes three arguments. The new
    // parameter is optional precisely so this change cannot alter
    // any of them, and that has to be asserted rather than assumed.
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, null).canApprove).toBe(true);
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, 10_000).canApprove).toBe(true);
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, 90_000).canApprove).toBe(false);
  });

  it("an unknown actionKey does not silently escalate", () => {
    // A typo'd or removed key must not turn into a denial — that
    // would fail closed in a way nobody could diagnose from the UI.
    expect(checkApprovalAuthority("marketing_manager", THRESHOLD, null, "not_a_real_action").canApprove).toBe(true);
  });

  it("roles with no authority are unaffected either way", () => {
    for (const role of ["designer", "content_writer", "sales", "viewer"] as const) {
      expect(checkApprovalAuthority(role, THRESHOLD, null, "update_product_price").canApprove).toBe(false);
      expect(checkApprovalAuthority(role, THRESHOLD, null, "publish_post").canApprove).toBe(false);
    }
  });
});

describe("every critical no-amount publish action is covered", () => {
  it("finds them from the policy table rather than a hardcoded list", () => {
    // Derived, so a future critical action added to ACTION_POLICIES is
    // covered the day it lands instead of when someone remembers.
    const criticalKeys = Object.entries(ACTION_POLICIES)
      .filter(([, p]) => p.riskLevel === "critical")
      .map(([k]) => k);

    expect(criticalKeys).toContain("update_product_price");

    for (const key of criticalKeys) {
      const result = checkApprovalAuthority("marketing_manager", THRESHOLD, null, key);
      expect(result.canApprove, `${key} is critical with no amount and must escalate`).toBe(false);
    }
  });
});
