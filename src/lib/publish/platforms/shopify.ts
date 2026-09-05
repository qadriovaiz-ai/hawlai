// Shopify as a PublishPlatform.
//
// THE ONLY FILE PERMITTED TO WRITE TO SHOPIFY. That is enforced by
// tests/publishContract.test.ts, which fails if a mutation signature
// appears anywhere outside src/lib/publish/platforms/ — because a rule
// that lives only in a convention gets bypassed by the next person in
// a hurry, and every approval test stays green while it happens.
//
// FOR REVIEW. Nothing calls this yet: no tool definition, no executor
// loop. It implements the interface and stops there, deliberately, so
// the write path can be read on its own before anything can reach it.

import {
  type PublishPlatform,
  type PublishActionRecord,
  type PreviewResult,
  type ExecuteResult,
  type FieldChange,
  type ActionKey,
} from "@/lib/publish/types";
import { shopifyGraphQL, shopifyMutation } from "@/lib/commerce/shopifyGraphQL";

/** One variant's current state — the before-values a preview is built from. */
const VARIANT_QUERY = `
  query PublishVariant($id: ID!) {
    productVariant(id: $id) {
      id
      title
      price
      product { id title status }
    }
  }
`;

/**
 * The current mutation for variant prices. Takes a productId and an
 * array of variants — Shopify moved price updates to this bulk form,
 * so even a single-variant change goes through it.
 */
const PRICE_MUTATION = `
  mutation PublishPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

type VariantNode = {
  id: string;
  title: string;
  price: string;
  product: { id: string; title: string; status: string };
};

/** Money comparison by VALUE, not by string. "999" and "999.00" are the same price. */
function samePrice(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a === b;
  return Math.abs(na - nb) < 0.005;
}

export function createShopifyPlatform(deps: {
  /** Resolves a usable access token — see getValidShopifyAccessToken. */
  getCredentials: (dealershipId: string) => Promise<{ shop: string; accessToken: string } | null>;
  fetchImpl?: typeof fetch;
}): PublishPlatform {
  const fetchImpl = deps.fetchImpl ?? fetch;

  /**
   * Shopify's capabilities, and NOT a copy of the full ActionKey list.
   *
   * publish_post and update_post are absent because Shopify is not a
   * CMS in the sense those mean. Declaring them would produce a tool
   * the assistant offers on a Shopify store and that fails when used.
   */
  const supports: readonly ActionKey[] = [
    "update_product_price",
    "update_product_description",
    "create_discount_code",
  ];

  async function readVariant(shop: string, token: string, variantId: string): Promise<VariantNode | null> {
    const result = await shopifyGraphQL<{ productVariant: VariantNode | null }>(
      shop,
      token,
      VARIANT_QUERY,
      { id: variantId },
      fetchImpl
    );
    if (!result.ok) return null;
    return result.data.productVariant ?? null;
  }

  return {
    id: "shopify",
    supports,

    async isConnected(dealershipId: string): Promise<boolean> {
      return (await deps.getCredentials(dealershipId)) !== null;
    },

    async preview(action: PublishActionRecord): Promise<PreviewResult> {
      if (!supports.includes(action.actionKey)) {
        return { ok: false, reason: `Shopify cannot do "${action.actionKey}".` };
      }
      if (action.actionKey !== "update_product_price") {
        // Honest rather than silently doing nothing. The other two
        // supported keys are declared but not implemented in this
        // pass, and a preview that returned an empty diff would look
        // like "no changes needed".
        return { ok: false, reason: `Preview for "${action.actionKey}" is not built yet.` };
      }

      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "Shopify isn't connected." };
      if (!action.targetRef) return { ok: false, reason: "No product variant was specified." };

      const variant = await readVariant(creds.shop, creds.accessToken, action.targetRef);
      if (!variant) return { ok: false, reason: "That product variant no longer exists in Shopify." };

      const nextPrice = String(action.requestedChanges.price ?? "");
      if (!nextPrice || Number.isNaN(Number(nextPrice)) || Number(nextPrice) < 0) {
        return { ok: false, reason: "That price isn't a valid amount." };
      }

      const changes: FieldChange[] = [{ field: "price", before: variant.price, after: nextPrice }];

      // Warnings inform the decision; they never block it. The person
      // approving is the one entitled to decide a 40% cut is correct —
      // they are not entitled to be surprised by it.
      const warnings: string[] = [];
      const before = Number(variant.price);
      const after = Number(nextPrice);
      if (Number.isFinite(before) && before > 0 && Number.isFinite(after)) {
        const deltaPct = Math.round(((after - before) / before) * 100);
        if (Math.abs(deltaPct) >= 20) {
          warnings.push(`${deltaPct > 0 ? "Increase" : "Reduction"} of ${Math.abs(deltaPct)}%.`);
        }
        if (after === 0) warnings.push("This makes the product free.");
      }
      if (variant.product.status !== "ACTIVE") {
        warnings.push(`This product is ${variant.product.status.toLowerCase()} — the change won't be visible to customers until it's active.`);
      }
      if (samePrice(variant.price, nextPrice)) {
        warnings.push("The price is already this value — approving will change nothing.");
      }

      return {
        ok: true,
        preview: {
          summary: `Price of "${variant.product.title}${variant.title && variant.title !== "Default Title" ? ` — ${variant.title}` : ""}": ${variant.price} → ${nextPrice}`,
          changes,
          warnings,
        },
      };
    },

    async execute(action: PublishActionRecord): Promise<ExecuteResult> {
      if (action.actionKey !== "update_product_price") {
        return { ok: false, reason: `Execute for "${action.actionKey}" is not built yet.` };
      }

      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "Shopify isn't connected." };
      if (!action.targetRef) return { ok: false, reason: "No product variant was specified." };
      if (!action.preview) return { ok: false, reason: "This action was never previewed." };

      // RE-READ BEFORE WRITING. The contract, and the reason execute()
      // cannot simply apply the approved payload.
      //
      // Someone previews a price at 10am and approves at 3pm. If it
      // changed in Shopify at noon, applying the approved intent
      // silently overwrites a change nobody saw and nobody agreed to.
      // The approval was for a TRANSITION — "1,299 becomes 999" — not
      // for a final value.
      const current = await readVariant(creds.shop, creds.accessToken, action.targetRef);
      if (!current) return { ok: false, reason: "That product variant no longer exists in Shopify." };

      const expected = action.preview.changes.find((c) => c.field === "price");
      if (!expected) return { ok: false, reason: "The preview did not record a price to verify against." };

      // ALREADY AT THE TARGET — checked BEFORE staleness, and the
      // order is the whole of retry safety.
      //
      // A test caught this the other way round. With the stale check
      // first, a successful write followed by a timeout and a retry
      // reads 999, compares it to the recorded before of 1299, and
      // reports STALE — marking an action that actually succeeded as
      // needing re-approval. The idempotency key would be doing
      // nothing.
      //
      // If the desired end state is already true, applying again is a
      // no-op regardless of who got it there, so success without a
      // write is both correct and the only answer that survives a
      // retry.
      if (samePrice(current.price, expected.after)) {
        return { ok: true, platformResponse: { skipped: "already at the requested price" } };
      }

      if (!samePrice(current.price, expected.before)) {
        // Not a failure — the human's decision is simply out of date.
        // Nothing is written.
        return {
          ok: false,
          stale: true,
          changed: [{ field: "price", before: expected.before, after: current.price }],
        };
      }

      const result = await shopifyMutation<{ productVariants: { id: string; price: string }[] }>(
        creds.shop,
        creds.accessToken,
        PRICE_MUTATION,
        {
          productId: current.product.id,
          variants: [{ id: current.id, price: expected.after }],
        },
        // The mutation name is required, and it is what forces the
        // userErrors check. Shopify declines a write with HTTP 200,
        // an empty `errors`, and a populated `userErrors`.
        "productVariantsBulkUpdate",
        fetchImpl
      );

      if (!result.ok) return { ok: false, reason: result.reason };
      return { ok: true, platformResponse: result.data };
    },
  };
}
