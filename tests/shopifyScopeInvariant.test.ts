// The connect health check must stay inside the scope we request.
//
// FROM A LIVE FAILURE, 2026-09-04. The callback verified the new token
// by calling shop.json. shop.json requires `read_shop`; the app
// requests only `read_products`. Shopify returned 403 on a token that
// was completely valid — OAuth had succeeded end to end, HMAC
// verified, code exchanged, token issued — and the dealer was shown
// "the access was refused, check you're an admin on that store",
// which was both wrong and unactionable. They went looking at their
// own store permissions for a bug in our health check.
//
// The invariant worth pinning is not "call products.json". It is: the
// resource used to prove the token works must be one the token was
// actually granted. Any future probe that drifts outside SHOPIFY_SCOPES
// reintroduces this exact failure, and it CANNOT be caught by a unit
// test of the pure logic — the pure logic was right.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { SHOPIFY_SCOPES } from "@/lib/commerce/shopifyAuth";

// Read the committed tree, per the lesson from 6747c76.
function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

const CALLBACK = "src/app/api/integrations/shopify/callback/route.ts";

// Which Admin API resources each scope actually grants. Only the ones
// this app could plausibly reach for — the point is the mapping, not
// completeness.
const GRANTED_BY: Record<string, string[]> = {
  read_products: ["products", "collections", "variants"],
  read_orders: ["orders"],
  read_customers: ["customers"],
  read_shop: ["shop"],
};

describe("Shopify connect health check", () => {
  const source = committed(CALLBACK);

  /** Admin API resources the callback calls, e.g. ["products"]. */
  const resources = Array.from(source.matchAll(/admin\/api\/\$\{[A-Z_]+\}\/([a-z_]+)\.json/g)).map((m) => m[1]);

  it("calls at least one Admin API resource to verify the token", () => {
    // Guards against the checks below passing vacuously if the
    // verification step is ever removed entirely.
    expect(resources.length).toBeGreaterThan(0);
  });

  it("NEVER verifies with shop.json", () => {
    // The exact bug. read_shop is not requested and should not be:
    // asking for it to satisfy a health check is scope creep with no
    // benefit to the dealer.
    expect(resources).not.toContain("shop");
    expect(SHOPIFY_SCOPES).not.toContain("read_shop");
  });

  it("only verifies with resources the requested scopes actually grant", () => {
    // THE LOAD-BEARING ONE. Not "must be products.json" — that would
    // pin an implementation detail. This pins the rule: whatever the
    // probe is, the token must have been granted it.
    const allowed = SHOPIFY_SCOPES.split(",")
      .map((s) => s.trim())
      .flatMap((scope) => GRANTED_BY[scope] ?? []);

    for (const resource of resources) {
      expect(
        allowed,
        `callback verifies with ${resource}.json, which "${SHOPIFY_SCOPES}" does not grant — Shopify will 403 a valid token`
      ).toContain(resource);
    }
  });

  it("distinguishes a scope refusal from a rejected token", () => {
    // Collapsing 401 and 403 into one message is what made this take
    // a live connect attempt to diagnose: the dealer was sent to
    // check their own admin rights over a permissions bug on our
    // side.
    expect(source).toContain("missing_scope");
    expect(source).toMatch(/status === 403/);
  });
});
