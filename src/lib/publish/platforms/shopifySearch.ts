// Finding candidate variants in a Shopify store.
//
// FOR REVIEW. Nothing calls this yet.
//
// Searching is platform-specific; deciding what the results MEAN is
// not, and lives in src/lib/publish/resolve.ts. This file only turns a
// phrase into candidates — it never decides that one of them is the
// answer.

import { shopifyGraphQL } from "@/lib/commerce/shopifyGraphQL";
import type { ResolvedTarget } from "@/lib/publish/resolve";

/**
 * Variants, flattened from Shopify's product/variant nesting.
 *
 * VARIANTS, NOT PRODUCTS, because a price belongs to a variant. A
 * product called "Kurta" with Small/Medium/Large is three prices, and
 * resolving to the product would leave the caller to pick a variant —
 * which is the guess this whole layer exists to avoid.
 *
 * `first: 20` on variants rather than 1: a product with 30 sizes would
 * silently lose most of them, and "the size you wanted was not in the
 * list" is indistinguishable from "it does not exist".
 */
const SEARCH_QUERY = `
  query PublishSearch($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          status
          featuredImage { url }
          variants(first: 20) {
            edges { node { id title price } }
          }
        }
      }
    }
  }
`;

/**
 * Candidates matching a phrase.
 *
 * Returns EVERY match, unranked and untrimmed. Ranking would be the
 * first step towards a best-guess, and the caller's job is to show a
 * person the options — not to receive a pre-narrowed list that hides
 * the one they actually meant.
 */
export async function searchShopifyVariants(
  shop: string,
  accessToken: string,
  phrase: string,
  fetchImpl: typeof fetch = fetch,
  limit = 10
): Promise<{ ok: true; candidates: ResolvedTarget[] } | { ok: false; reason: string }> {
  const cleaned = phrase.trim();
  if (!cleaned) return { ok: false, reason: "No product name was given." };

  // Shopify's search syntax. Quoted so a multi-word phrase is one term
  // rather than an implicit OR across words — unquoted, "blue kurta"
  // matches everything blue AND everything kurta, which is a longer
  // list that is mostly noise.
  const result = await shopifyGraphQL<{ products: { edges: { node: any }[] } }>(
    shop,
    accessToken,
    SEARCH_QUERY,
    { query: `title:*${cleaned.replace(/["\\]/g, "")}*`, first: limit },
    fetchImpl
  );
  if (!result.ok) return { ok: false, reason: result.reason };

  const candidates: ResolvedTarget[] = [];
  for (const { node: product } of result.data.products?.edges ?? []) {
    for (const { node: variant } of product.variants?.edges ?? []) {
      candidates.push({
        ref: variant.id,
        title: product.title,
        // Shopify names a sole variant "Default Title", which means
        // nothing to a merchant. Null reads as "this product has one
        // version" wherever it is displayed.
        variantTitle: variant.title && variant.title !== "Default Title" ? variant.title : null,
        currentPrice: variant.price ?? null,
        imageUrl: product.featuredImage?.url ?? null,
        active: product.status === "ACTIVE",
      });
    }
  }

  return { ok: true, candidates };
}
