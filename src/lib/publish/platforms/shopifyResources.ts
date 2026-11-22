// Turning "my About page" into a Shopify gid.
//
// WHY THIS IS ITS OWN FILE. Every content action in shopify.ts takes an
// `id: ID!` — PAGE_QUERY, COLLECTION_QUERY, the article's blogId. The
// adapter has no search of any kind, deliberately: resolving which
// thing the owner meant is a conversation, and an adapter that guessed
// would be guessing on the far side of the approval card.
//
// So the producer resolves, and this is the resolving. Read-only: it
// issues list queries and nothing else, and it cannot write.
//
// THE FAILURE IT IS SHAPED AROUND is already recorded on the Hawlai
// side, in masterBrainV2's page resolver: "Asked for a page that isn't
// there: show what is. The predecessor fell through to the hero and
// reported success." A resolver that falls back to "the first one" is
// worse than one that asks, because the owner approves a card naming
// the page they wanted and the write lands somewhere else.

import { shopifyGraphQL } from "@/lib/commerce/shopifyGraphQL";
import { matchResource, type Resource, type ResolveResult } from "../resolveResource";

/**
 * One thing the owner might have meant.
 *
 * An alias now — the shape is platform-neutral and lives in
 * ../resolveResource.ts. Kept as a name because callers import it.
 */
export type ShopifyResource = Resource;

/**
 * The result shape, an alias to the shared one.
 *
 * Re-exported rather than redeclared so the two cannot drift: a local
 * copy that gained a reason the matcher never returns would compile
 * and mislead every caller reading it.
 */
export type { ResolveResult };

const PAGES_QUERY = `
  query ResolvePages {
    pages(first: 100) { nodes { id title handle } }
  }
`;

const COLLECTIONS_QUERY = `
  query ResolveCollections {
    collections(first: 100) { nodes { id title handle } }
  }
`;

const BLOGS_QUERY = `
  query ResolveBlogs {
    blogs(first: 50) { nodes { id title handle } }
  }
`;

const QUERY_FOR = {
  page: { query: PAGES_QUERY, root: "pages", noun: "page" },
  collection: { query: COLLECTIONS_QUERY, root: "collections", noun: "collection" },
  blog: { query: BLOGS_QUERY, root: "blogs", noun: "blog" },
} as const;

export type ShopifyResourceKind = keyof typeof QUERY_FOR;

/**
 * Everything of one kind on the store, or null if it could not be read.
 *
 * NULL IS NOT AN EMPTY LIST, the same distinction the adapter's
 * readBlogs makes. "Couldn't reach Shopify" and "this store has no
 * collections" lead to different sentences and only one of them is the
 * merchant's to fix.
 */
export async function listShopifyResources(
  shop: string,
  accessToken: string,
  kind: ShopifyResourceKind,
  fetchImpl: typeof fetch = fetch
): Promise<ShopifyResource[] | null> {
  const { query, root } = QUERY_FOR[kind];
  const result = await shopifyGraphQL<Record<string, { nodes: ShopifyResource[] }>>(
    shop,
    accessToken,
    query,
    {},
    fetchImpl
  );
  if (!result.ok) return null;
  return result.data?.[root]?.nodes ?? [];
}

/**
 * Which one the owner meant.
 *
 * MOVED TO ../resolveResource.ts ON 22 NOVEMBER 2026, unchanged, when
 * WordPress needed the same decision. This is a delegate, not a second
 * implementation: a second copy is how `metaTitle` and `seoTitle` came
 * to mean the same field on one ActionKey, and every assertion already
 * written against this name still exercises the real matcher.
 *
 * The reasoning — strongest evidence first, no fuzzy score, any tie is
 * a question rather than a pick — is recorded there, with the incident
 * behind it.
 */
export function matchShopifyResource(asked: string, all: ShopifyResource[]): ResolveResult {
  return matchResource(asked, all, "store");
}

/**
 * List and match in one call — what a producer actually wants.
 *
 * Kept separate from the two halves so a tool that already holds the
 * list (because it just showed the owner the candidates) does not read
 * the store twice.
 */
export async function resolveShopifyResource(
  shop: string,
  accessToken: string,
  kind: ShopifyResourceKind,
  asked: string,
  fetchImpl: typeof fetch = fetch
): Promise<ResolveResult> {
  const all = await listShopifyResources(shop, accessToken, kind, fetchImpl);
  if (all === null) {
    return {
      ok: false,
      reason: "unreadable",
      message: `Couldn't read this store's ${QUERY_FOR[kind].noun}s from Shopify, so I don't know which one you mean.`,
      candidates: [],
    };
  }
  const matched = matchShopifyResource(asked, all);
  // The noun belongs in the sentence, and only this function knows it.
  if (!matched.ok && matched.reason === "none_exist") {
    return { ...matched, message: `This store has no ${QUERY_FOR[kind].noun}s yet.` };
  }
  return matched;
}
