// The publish layer's contract, pinned before any platform implements it.
//
// Written FIRST, deliberately. These assertions describe rules that
// are easy to state now and easy to erode later under delivery
// pressure — "just this once, write directly", "the threshold covers
// it". Each one below is a rule the reviewer agreed to, in a form that
// fails rather than argues.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { ACTION_POLICIES, getActionPolicy } from "@/lib/executionPolicy";
import { ALWAYS_REQUIRES_APPROVAL, ACTION_RISK, type ActionKey } from "@/lib/publish/types";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

describe("every publish action requires approval, unconditionally", () => {
  it.each(ALWAYS_REQUIRES_APPROVAL.map((k) => [k] as [ActionKey]))(
    "%s is approval-gated in ACTION_POLICIES",
    (key) => {
      // THE LOAD-BEARING ONE. The agreed rule was "a hard rule in
      // ACTION_POLICIES, not a threshold check that could be bypassed
      // by a small change". This is that rule, enforced.
      const policy = getActionPolicy(key);
      expect(policy, `${key} has no ACTION_POLICIES entry — the policy layer would not know it exists`).not.toBeNull();
      expect(policy!.requiresApproval, `${key} must ALWAYS require approval`).toBe(true);
    }
  );

  it("price changes are classified critical, not merely high", () => {
    // A price is live and public the instant it lands. Nothing else in
    // this product changes what a merchant's customers see with no
    // second step — an ad campaign is created paused and activated
    // separately.
    expect(ACTION_POLICIES.update_product_price.riskLevel).toBe("critical");
    expect(ACTION_RISK.update_product_price).toBe("critical");
  });

  it("the two risk tables agree with each other", () => {
    // ACTION_RISK drives the approval UI; ACTION_POLICIES drives the
    // gate. If they drift, the screen shows one severity while the
    // system enforces another — the kind of split that makes an audit
    // trail untrustworthy without ever failing anything.
    for (const key of Object.keys(ACTION_RISK) as ActionKey[]) {
      expect(getActionPolicy(key)?.riskLevel, `${key} risk level disagrees between the two tables`).toBe(ACTION_RISK[key]);
    }
  });

  it("does not pass vacuously", () => {
    expect(ALWAYS_REQUIRES_APPROVAL.length).toBeGreaterThanOrEqual(5);
  });
});

describe("writes go through a platform module, and nowhere else", () => {
  // The same shape as selfAuthenticatingRoutes.test.ts and for the
  // same reason: a rule that lives only in a convention gets bypassed
  // by the next person in a hurry, and every approval test stays green
  // while it happens. A route that writes to Shopify directly would
  // pass every assertion in the block above.
  //
  // Currently vacuous BY CONSTRUCTION — no platform module exists and
  // no write call exists either. It is committed now so that the first
  // Shopify write is born already covered, rather than being retrofitted
  // after the pattern has spread.
  const WRITE_SIGNATURES = [
    // Shopify GraphQL mutations and REST writes
    "productVariantsBulkUpdate",
    "productUpdate",
    "discountCodeBasicCreate",
    // WordPress REST writes
    "/wp-json/wp/v2/posts",
    "/wp-json/wc/v3/coupons",
  ];

  function committedFilesContaining(needle: string): string[] {
    try {
      const out = execFileSync("git", ["grep", "-l", "-F", needle, "HEAD", "--", "src"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.split("\n").filter(Boolean).map((l) => l.replace(/^HEAD:/, ""));
    } catch {
      return [];
    }
  }

  it.each(WRITE_SIGNATURES.map((s) => [s] as [string]))(
    "%s appears only inside src/lib/publish/platforms/",
    (signature) => {
      const offenders = committedFilesContaining(signature).filter(
        (f) => !f.startsWith("src/lib/publish/platforms/")
      );
      expect(
        offenders,
        `platform write "${signature}" found outside a platform module: ${offenders.join(", ")}. Every write must go through PublishPlatform.execute() so it cannot skip the approval gate.`
      ).toEqual([]);
    }
  );
});

describe("the interface says what it must", () => {
  const source = committed("src/lib/publish/types.ts");

  it("execute() is documented as re-verifying the before-state", () => {
    // The stale-preview hazard is the one rule that cannot be enforced
    // structurally before an implementation exists, so the contract is
    // pinned in the interface it will be written against.
    expect(source).toMatch(/re-read current state/i);
    expect(source).toMatch(/stale/);
  });

  it("declares a capability model rather than assuming parity", () => {
    // WordPress has no native promo codes — coupons belong to
    // WooCommerce, a separate plugin with its own API. A universal
    // "create discount" would produce a tool the assistant offers on
    // sites that cannot do it.
    expect(source).toMatch(/supports/);
    expect(source).toMatch(/WooCommerce/);
  });
});
