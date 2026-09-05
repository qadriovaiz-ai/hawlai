// ------------------------------------------------------------------
// Shopify Agent — merchant's own Custom App token, no OAuth approval
// ------------------------------------------------------------------
// Instead of Hawlai registering its own public Shopify app (a real
// review process, same category as Google/LinkedIn/TikTok Ads), the
// merchant creates a "Custom App" inside their OWN store admin
// (Settings -> Apps -> Develop apps), which takes a couple of
// minutes and needs no approval from Shopify at all, and pastes the
// generated Admin API access token here.
// ------------------------------------------------------------------

import { shopifyGraphQL } from "@/lib/commerce/shopifyGraphQL";

function normalizeStoreUrl(storeUrl: string): string {
  let url = storeUrl.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!url.includes(".myshopify.com") && !url.includes(".")) {
    url = `${url}.myshopify.com`;
  }
  return url;
}

// UNUSED since the OAuth flow replaced the paste-a-token screen, and
// DO NOT reuse it as a connection check without reading this first:
// shop.json requires `read_shop`, which the OAuth app does not
// request (SHOPIFY_SCOPES is read_products). It returns 403 on a
// perfectly valid token. That cost a live connect attempt on
// 2026-09-04 — the callback used it as a health check and told the
// dealer their access had been refused after OAuth had fully
// succeeded. Verify with products.json instead.
export async function testShopifyConnection(storeUrl: string, accessToken: string): Promise<{ success: boolean; shopName?: string; error?: string }> {
  try {
    const domain = normalizeStoreUrl(storeUrl);
    const res = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body?.errors ?? `Shopify returned ${res.status} — check the store URL and token` };
    }
    const data = await res.json();
    return { success: true, shopName: data.shop?.name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface ShopifyProduct {
  id: string;
  title: string;
  price: string | null;
  image_url: string | null;
  product_url: string | null;
}

// GraphQL, because REST /products is DEPRECATED for public apps
// (deadline 1 Feb 2025, long past) — not a modernisation, the only
// door left open to an app like this one.
//
// The response SHAPE differs, and that is the substance of this
// migration rather than the endpoint swap. REST embedded variants and
// images as plain arrays on the product; GraphQL nests them as
// connections, so `p.variants[0].price` becomes
// `p.variants.edges[0].node.price`. Reading the old shape off the new
// response yields undefined everywhere, silently — a product list
// that renders with every price blank rather than failing.
const PRODUCTS_QUERY = `
  query SmokeProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          variants(first: 1) { edges { node { price } } }
          images(first: 1) { edges { node { url } } }
        }
      }
    }
  }
`;

export async function fetchShopifyProducts(storeUrl: string, accessToken: string, limit: number = 20): Promise<ShopifyProduct[]> {
  const domain = normalizeStoreUrl(storeUrl);
  const result = await shopifyGraphQL<{ products: { edges: { node: any }[] } }>(
    domain,
    accessToken,
    PRODUCTS_QUERY,
    { first: limit }
  );
  // Throwing preserves the existing contract — both call sites already
  // wrap this in try/catch and treat a throw as "connected, no
  // products". Returning a Result here would silently change that to
  // "no products" with no error logged anywhere.
  if (!result.ok) throw new Error(result.reason);

  return (result.data.products?.edges ?? []).map(({ node: p }: { node: any }) => ({
    // A GraphQL id is "gid://shopify/Product/123", not a bare number.
    // Kept whole: it is what every mutation takes as input, and
    // stripping it to a number would mean reconstructing it later
    // from a format that is Shopify's to change.
    id: String(p.id),
    title: p.title,
    price: p.variants?.edges?.[0]?.node?.price ?? null,
    image_url: p.images?.edges?.[0]?.node?.url ?? null,
    // Uses the .myshopify.com domain by default — if the store has a
    // custom domain connected, that would need to be entered
    // separately since Shopify's API doesn't expose it here.
    product_url: p.handle ? `https://${domain}/products/${p.handle}` : null,
  }));
}
