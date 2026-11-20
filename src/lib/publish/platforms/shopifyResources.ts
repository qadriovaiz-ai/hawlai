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

/** One thing the owner might have meant. */
export type ShopifyResource = {
  /** The gid the adapter needs. */
  id: string;
  /** What the merchant calls it. */
  title: string;
  /** The URL slug, which is often what they type. */
  handle: string;
};

export type ResolveResult =
  | { ok: true; resource: ShopifyResource; matchType: "handle" | "title" | "only_one" | "contains" }
  /**
   * Could not tell. Carries what DOES exist, because the one useful
   * reply to "which page?" is the list.
   */
  | { ok: false; reason: "ambiguous" | "none_exist" | "unreadable"; message: string; candidates: ShopifyResource[] };

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

/** Case and punctuation folded, so "About Us" matches "about-us". */
function fold(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Which one the owner meant.
 *
 * THE ORDER OF THE ATTEMPTS IS THE WHOLE DESIGN, strongest evidence
 * first, and nothing after `contains` — a resolver that reached for a
 * fuzzy score would start writing to pages nobody named.
 *
 *   1. the handle, exactly. What they typed IS the slug.
 *   2. the title, exactly.
 *   3. the only one there is. "Update my collection" on a store with
 *      one collection is not ambiguous.
 *   4. a unique substring either way round, so "about" finds
 *      "About us" and "about us page" finds "About us".
 *
 * ANY TIE IS A QUESTION, never a pick. Two pages containing "policy"
 * means asking, because approving a card that says "Refund policy"
 * while the write lands on "Privacy policy" is the exact failure the
 * Hawlai resolver records.
 */
export function matchShopifyResource(asked: string, all: ShopifyResource[]): ResolveResult {
  const noun = "item";
  if (!all.length) {
    return { ok: false, reason: "none_exist", message: `This store has no ${noun}s yet.`, candidates: [] };
  }

  const wanted = fold(asked);
  if (wanted) {
    const byHandle = all.filter((r) => fold(r.handle) === wanted);
    if (byHandle.length === 1) return { ok: true, resource: byHandle[0], matchType: "handle" };

    const byTitle = all.filter((r) => fold(r.title) === wanted);
    if (byTitle.length === 1) return { ok: true, resource: byTitle[0], matchType: "title" };
  }

  // Nothing named, and there is only one thing it could be.
  if (!wanted && all.length === 1) return { ok: true, resource: all[0], matchType: "only_one" };

  if (wanted) {
    const loose = all.filter((r) => {
      const h = fold(r.handle);
      const t = fold(r.title);
      return h.includes(wanted) || wanted.includes(h) || t.includes(wanted) || wanted.includes(t);
    });
    if (loose.length === 1) return { ok: true, resource: loose[0], matchType: "contains" };
    if (loose.length > 1) {
      // NARROWED TO THE PLAUSIBLE ONES, not the whole store. Asking
      // "which of these two policies" is answerable; asking it about
      // forty pages is a list nobody reads.
      return {
        ok: false,
        reason: "ambiguous",
        message: `More than one matches "${asked}".`,
        candidates: loose,
      };
    }
  }

  return {
    ok: false,
    reason: "ambiguous",
    message: wanted ? `Nothing on this store is called "${asked}".` : "Which one did you mean?",
    candidates: all,
  };
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
