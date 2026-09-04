// Does the granted scope list cover what we need?
//
// FROM A LIVE INSTALL, 2026-09-04. The app declared six scopes on the
// active version. Shopify granted:
//
//   read_customers, read_orders, write_products, write_content
//
// read_products and read_content were absent, and the callback treated
// that as a failed grant: "Shopify didn't grant permission to read
// products." The grant was complete. Shopify's own documentation says
// "Any permission to write a resource includes permission to read it,
// so request the write scope only when your app needs both" — and it
// omits the implied read scope from the list it returns.
//
// The tell was in the shape of what was missing: both absent scopes
// were the read counterparts of the two granted writes, while
// read_customers and read_orders came through untouched. Reads were
// not being refused; redundant ones were being collapsed.
//
// This was a plain `granted.includes(required)` — a membership test
// against a list that models implication.

import { describe, it, expect } from "vitest";
import { scopeSatisfied, missingScopes, SHOPIFY_SCOPES } from "@/lib/commerce/shopifyAuth";

// The exact grant from the live install, kept verbatim as the
// regression case. If this ever fails again, it fails here first.
const REAL_GRANT = "read_customers,read_orders,write_products,write_content";

describe("scopeSatisfied", () => {
  it("accepts an exact match", () => {
    expect(scopeSatisfied("read_products", ["read_products"])).toBe(true);
    expect(scopeSatisfied("write_products", ["write_products"])).toBe(true);
  });

  it("accepts write_x as covering read_x", () => {
    // The documented rule, and the whole bug.
    expect(scopeSatisfied("read_products", ["write_products"])).toBe(true);
    expect(scopeSatisfied("read_content", ["write_content"])).toBe(true);
  });

  it("does NOT accept read_x as covering write_x", () => {
    // The implication runs one way only. Getting this backwards
    // would let the app believe it can write to a merchant's store
    // when it cannot — a worse failure than the one being fixed,
    // because it would surface as a mysterious 403 mid-operation
    // rather than at connect time.
    expect(scopeSatisfied("write_products", ["read_products"])).toBe(false);
    expect(scopeSatisfied("write_orders", ["read_orders"])).toBe(false);
  });

  it("does not match across different resources", () => {
    expect(scopeSatisfied("read_products", ["write_orders", "read_customers"])).toBe(false);
    // Guards a naive prefix/substring implementation: "read_product"
    // is not "read_products", and write_product_listings is a real
    // Shopify scope that must not satisfy read_products.
    expect(scopeSatisfied("read_products", ["write_product_listings"])).toBe(false);
    expect(scopeSatisfied("read_products", ["read_product"])).toBe(false);
  });

  it("handles an empty grant without throwing", () => {
    expect(scopeSatisfied("read_products", [])).toBe(false);
  });
});

describe("missingScopes", () => {
  it("reports nothing missing for the real live grant", () => {
    // THE REGRESSION CASE. This exact string was rejected in
    // production over a grant that was entirely correct.
    expect(missingScopes(SHOPIFY_SCOPES, REAL_GRANT)).toEqual([]);
    expect(missingScopes("read_products", REAL_GRANT)).toEqual([]);
    expect(missingScopes("read_products,read_content", REAL_GRANT)).toEqual([]);
  });

  it("still reports a genuinely absent scope", () => {
    // The check must not become a rubber stamp. read_shop is neither
    // granted nor implied by anything in the real grant.
    expect(missingScopes("read_shop", REAL_GRANT)).toEqual(["read_shop"]);
    expect(missingScopes("read_products,read_shop", REAL_GRANT)).toEqual(["read_shop"]);
  });

  it("treats an empty grant as everything missing", () => {
    // What a genuinely broken install looks like, and it must stay
    // distinguishable from the case above.
    expect(missingScopes(SHOPIFY_SCOPES, "")).toEqual(["read_products"]);
    expect(missingScopes(SHOPIFY_SCOPES, "   ")).toEqual(["read_products"]);
  });

  it("tolerates whitespace and stray separators in Shopify's list", () => {
    expect(missingScopes("read_products", " write_products , read_orders ")).toEqual([]);
    expect(missingScopes("read_products", "read_orders,,write_products")).toEqual([]);
  });

  it("is satisfied by an exact read grant too, not only by write", () => {
    // The ordinary case must keep working — the fix is additive.
    expect(missingScopes("read_products", "read_products")).toEqual([]);
  });
});
