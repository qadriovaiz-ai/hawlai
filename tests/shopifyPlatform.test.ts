// The Shopify write path — preview, and the stale check that guards it.
//
// The rule this file exists to prove: execute() re-reads current state
// and applies NOTHING if the world moved since the preview. Someone
// previews a price at 10am and approves at 3pm; if it changed at noon,
// applying the approved intent silently overwrites a change nobody saw
// and nobody agreed to. The approval was for a TRANSITION, not for a
// final value.
//
// That rule cannot be enforced structurally — only by a test that
// actually moves the price between the two calls.

import { describe, it, expect, vi } from "vitest";
import { createShopifyPlatform } from "@/lib/publish/platforms/shopify";
import type { PublishActionRecord } from "@/lib/publish/types";

const VARIANT_ID = "gid://shopify/ProductVariant/111";
const PRODUCT_ID = "gid://shopify/Product/222";

function variantResponse(price: string, status = "ACTIVE") {
  return {
    data: {
      productVariant: {
        id: VARIANT_ID,
        title: "Default Title",
        price,
        product: { id: PRODUCT_ID, title: "Blue Kurta", status },
      },
    },
  };
}

const mutationOk = { data: { productVariantsBulkUpdate: { productVariants: [{ id: VARIANT_ID, price: "999" }], userErrors: [] } } };

/** A fetch that returns each queued body in order, recording the calls. */
function sequence(bodies: unknown[]) {
  let i = 0;
  return vi.fn().mockImplementation(async () => {
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
}

const platform = (fetchImpl: typeof fetch, connected = true) =>
  createShopifyPlatform({
    getCredentials: async () => (connected ? { shop: "acme.myshopify.com", accessToken: "shpat_x" } : null),
    fetchImpl,
  });

const action = (over: Partial<PublishActionRecord> = {}): PublishActionRecord => ({
  id: "a1",
  dealershipId: "d1",
  platform: "shopify",
  connectionRef: null,
  actionKey: "update_product_price",
  targetRef: VARIANT_ID,
  targetLabel: "Blue Kurta",
  requestedChanges: { price: "999" },
  preview: { summary: "", changes: [{ field: "price", before: "1299", after: "999" }], warnings: [] },
  previewedAt: new Date().toISOString(),
  status: "approved",
  idempotencyKey: "k1",
  ...over,
});

describe("capabilities are declared honestly", () => {
  it("does not claim it can publish posts", () => {
    // Shopify is not a CMS in the sense publish_post means. Declaring
    // it would produce a tool the assistant offers on a Shopify store
    // and that fails when used.
    const p = platform(sequence([{}]));
    expect(p.supports).not.toContain("publish_post");
    expect(p.supports).toContain("update_product_price");
  });

  it("refuses an action it does not support", async () => {
    const p = platform(sequence([{}]));
    const r = await p.preview(action({ actionKey: "publish_post" }));
    expect(r.ok).toBe(false);
  });
});

describe("preview reads, and never writes", () => {
  it("describes the change in terms a person can check", async () => {
    const f = sequence([variantResponse("1299")]);
    const r = await platform(f).preview(action());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.summary).toContain("Blue Kurta");
    expect(r.preview.summary).toContain("1299");
    expect(r.preview.summary).toContain("999");
    expect(r.preview.changes).toEqual([{ field: "price", before: "1299", after: "999" }]);
  });

  it("issues exactly ONE request, and it is a query", async () => {
    // A preview that wrote anything would defeat the entire gate.
    const f = sequence([variantResponse("1299")]);
    await platform(f).preview(action());
    expect((f as any).mock.calls.length).toBe(1);
    expect(JSON.parse((f as any).mock.calls[0][1].body).query).not.toContain("mutation");
  });

  it("warns on a large reduction without blocking it", async () => {
    // The approver is entitled to decide a 23% cut is correct. They
    // are not entitled to be surprised by it.
    const r = await platform(sequence([variantResponse("1299")])).preview(action());
    expect(r.ok).toBe(true);
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/2[0-9]%/);
  });

  it("warns when the price is already the requested value", async () => {
    const r = await platform(sequence([variantResponse("999")])).preview(action());
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/already/i);
  });

  it("warns when the product is not visible to customers", async () => {
    const r = await platform(sequence([variantResponse("1299", "DRAFT")])).preview(action());
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/draft/i);
  });

  it("rejects a price that is not a valid amount", async () => {
    for (const bad of ["", "abc", "-5"]) {
      const r = await platform(sequence([variantResponse("1299")])).preview(action({ requestedChanges: { price: bad } }));
      expect(r.ok, `"${bad}" must be refused`).toBe(false);
    }
  });

  it("reports a variant that no longer exists", async () => {
    const r = await platform(sequence([{ data: { productVariant: null } }])).preview(action());
    expect(r.ok).toBe(false);
  });
});

describe("execute re-verifies before writing", () => {
  it("THE LOAD-BEARING ONE: refuses when the price moved since the preview", async () => {
    // Approved as 1299 → 999. Someone else set it to 1100 in between.
    // Applying the approved intent would erase a change nobody saw.
    const f = sequence([variantResponse("1100")]);
    const r = await platform(f).execute(action());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.stale).toBe(true);
    expect(r.ok === false && r.stale && r.changed[0]).toEqual({ field: "price", before: "1299", after: "1100" });
    // And crucially: NOTHING was written. One read, no mutation.
    expect((f as any).mock.calls.length).toBe(1);
  });

  it("writes when the before-state still matches", async () => {
    const f = sequence([variantResponse("1299"), mutationOk]);
    const r = await platform(f).execute(action());
    expect(r.ok).toBe(true);
    const mutationCall = (f as any).mock.calls[1];
    const body = JSON.parse(mutationCall[1].body);
    expect(body.query).toContain("productVariantsBulkUpdate");
    expect(body.variables.variants[0]).toEqual({ id: VARIANT_ID, price: "999" });
    expect(body.variables.productId).toBe(PRODUCT_ID);
  });

  it("is idempotent: already at the target price writes nothing", async () => {
    // What makes a retry safe. A timeout leaves the caller unable to
    // tell whether the write landed, so the retry must be harmless.
    const f = sequence([variantResponse("999")]);
    const r = await platform(f).execute(action());
    expect(r.ok).toBe(true);
    expect((f as any).mock.calls.length).toBe(1);
  });

  it("compares money by value, not by string", async () => {
    // "1299.00" and "1299" are the same price. Treating them as
    // different would make every action stale forever — the feature
    // would appear broken while behaving 'safely'.
    const f = sequence([variantResponse("1299.00"), mutationOk]);
    const r = await platform(f).execute(action());
    expect(r.ok).toBe(true);
  });

  it("surfaces a DECLINED write instead of reporting success", async () => {
    // Shopify returns 200 with populated userErrors. Without the
    // userErrors check this records a price change that never
    // happened.
    const declined = {
      data: { productVariantsBulkUpdate: { productVariants: [], userErrors: [{ field: ["price"], message: "Price is invalid" }] } },
    };
    const r = await platform(sequence([variantResponse("1299"), declined])).execute(action());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.stale).toBeFalsy();
    expect(r.ok === false && !r.stale && r.reason).toContain("Price is invalid");
  });

  it("refuses to execute an action that was never previewed", async () => {
    // Without a preview there is no before-state, so there is nothing
    // to verify against — and no human saw anything.
    const f = sequence([variantResponse("1299")]);
    const r = await platform(f).execute(action({ preview: null }));
    expect(r.ok).toBe(false);
    expect((f as any).mock.calls.length).toBe(0);
  });

  it("refuses when Shopify is not connected", async () => {
    const f = sequence([variantResponse("1299")]);
    const r = await platform(f, false).execute(action());
    expect(r.ok).toBe(false);
    expect((f as any).mock.calls.length).toBe(0);
  });
});
