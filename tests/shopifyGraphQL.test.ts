// The Shopify GraphQL door, and the three ways it can fail.
//
// GraphQL answers HTTP 200 for most failures, so `if (!res.ok)` — the
// shape every REST caller in this codebase uses — catches almost
// nothing. Layer 3 is the dangerous one: Shopify DECLINES a write and
// returns 200, an empty `errors`, and a populated `userErrors`. A
// caller checking only res.ok records a successful price change that
// never happened, and the merchant finds out from their storefront.

import { describe, it, expect, vi } from "vitest";
import { shopifyGraphQL, shopifyMutation } from "@/lib/commerce/shopifyGraphQL";
import { SHOPIFY_API_VERSION } from "@/lib/commerce/shopifyAuth";

const json = (body: unknown, status = 200, ok = status < 400) =>
  vi.fn().mockResolvedValue({ ok, status, text: async () => JSON.stringify(body) }) as unknown as typeof fetch;

describe("shopifyGraphQL — queries", () => {
  it("posts to the versioned graphql endpoint with the token", async () => {
    const f = json({ data: { shop: { name: "Acme" } } });
    await shopifyGraphQL("acme.myshopify.com", "shpat_x", "query { shop { name } }", {}, f);
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe(`https://acme.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`);
    expect(init.headers["X-Shopify-Access-Token"]).toBe("shpat_x");
    expect(JSON.parse(init.body).query).toContain("shop");
  });

  it("is not pinned to a version Shopify has retired", () => {
    // 2024-01 was hardcoded in three places and stopped being
    // supported in January 2025 — every call ran against a dead
    // version for over eighteen months.
    expect(SHOPIFY_API_VERSION).not.toBe("2024-01");
    expect(SHOPIFY_API_VERSION >= "2025-10").toBe(true);
  });

  it("LAYER 2: fails on a 200 carrying a top-level errors array", async () => {
    const f = json({ errors: [{ message: "Field 'nope' doesn't exist" }] });
    const r = await shopifyGraphQL("acme.myshopify.com", "t", "query { nope }", {}, f);
    expect(r).toEqual({ ok: false, reason: "Field 'nope' doesn't exist" });
  });

  it("LAYER 1: fails on a non-2xx, preferring Shopify's own message", async () => {
    const f = json({ errors: [{ message: "Invalid API key or access token" }] }, 401, false);
    const r = await shopifyGraphQL("acme.myshopify.com", "t", "query {}", {}, f);
    expect(r).toEqual({ ok: false, reason: "Invalid API key or access token" });
  });

  it("keeps the body when the response is not JSON", async () => {
    // A throttle page or proxy error is HTML. `await res.json()` would
    // throw and lose the one thing that explains the failure — the
    // same discarded-evidence mistake the OAuth callback made three
    // times before the logging was added.
    const f = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "<html>Too Many Requests</html>" }) as unknown as typeof fetch;
    const r = await shopifyGraphQL("acme.myshopify.com", "t", "query {}", {}, f);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toContain("Too Many Requests");
  });

  it("treats a missing data field as a failure", async () => {
    expect((await shopifyGraphQL("s", "t", "q", {}, json({}))).ok).toBe(false);
    expect((await shopifyGraphQL("s", "t", "q", {}, json({ data: null }))).ok).toBe(false);
  });

  it("reports a thrown network error rather than crashing the caller", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    expect(await shopifyGraphQL("s", "t", "q", {}, f)).toEqual({ ok: false, reason: "ECONNRESET" });
  });
});

describe("shopifyMutation — the userErrors layer", () => {
  const MUTATION = "mutation { productVariantsBulkUpdate { userErrors { field message } } }";

  it("LAYER 3: fails on 200 + empty errors + populated userErrors", async () => {
    // THE LOAD-BEARING ONE. This is a DECLINED WRITE that looks
    // entirely successful to any check based on res.ok or errors.
    const f = json({
      data: {
        productVariantsBulkUpdate: {
          productVariants: [],
          userErrors: [{ field: ["variants", "0", "price"], message: "Price must be greater than or equal to 0" }],
        },
      },
    });
    const r = await shopifyMutation("s", "t", MUTATION, {}, "productVariantsBulkUpdate", f);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toContain("Price must be greater than or equal to 0");
    // The field path is kept — "price" is what makes it actionable.
    expect((r as any).reason).toContain("variants.0.price");
  });

  it("succeeds when userErrors is empty", async () => {
    const f = json({
      data: { productVariantsBulkUpdate: { productVariants: [{ id: "gid://shopify/ProductVariant/1", price: "999.00" }], userErrors: [] } },
    });
    const r = await shopifyMutation<{ productVariants: { price: string }[] }>("s", "t", MUTATION, {}, "productVariantsBulkUpdate", f);
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.productVariants[0].price).toBe("999.00");
  });

  it("fails loudly when the mutation name does not match the query", async () => {
    // A typo would otherwise read as "no userErrors, therefore
    // success" — reintroducing the exact bug this function exists to
    // prevent, via a spelling mistake.
    const f = json({ data: { productVariantsBulkUpdate: { userErrors: [] } } });
    const r = await shopifyMutation("s", "t", MUTATION, {}, "productVariantsBulkUpdaet", f);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toContain("does not match");
  });

  it("still catches layers 1 and 2", async () => {
    expect((await shopifyMutation("s", "t", MUTATION, {}, "x", json({ errors: [{ message: "boom" }] }))).ok).toBe(false);
    expect((await shopifyMutation("s", "t", MUTATION, {}, "x", json({ errors: [{ message: "nope" }] }, 500, false))).ok).toBe(false);
  });
});
