// Turning "my About page" into a WordPress reference.
//
// ITS OWN FILE, for the reason shopifyResources.ts records: every
// content action in wordpress.ts takes a reference, and the adapter has
// no search of any kind, deliberately. Resolving which thing the owner
// meant is a conversation, and an adapter that guessed would be
// guessing on the far side of the approval card.
//
// So the producer resolves, and this is the resolving. Read-only: it
// lists, and it cannot write.
//
// THE MATCHER IS SHARED, not copied — see ../resolveResource.ts. A
// second implementation is how `metaTitle` and `seoTitle` came to mean
// the same field on one ActionKey.
//
// WHAT IS DIFFERENT FROM SHOPIFY, and it is the thing that matters:
// the id it returns is "post:7" or "page:7", NOT 7. WordPress shares an
// id space between post types — /wp/v2/posts/5 and /wp/v2/pages/5 can
// both exist and be different things — so a bare integer is not a
// reference to anything, and the adapter refuses one. Building the
// qualified form HERE means no caller has to remember to.

import { wordpressRequest, type WordPressCreds } from "@/lib/commerce/wordpressRest";
import { matchResource, type Resource, type ResolveResult } from "../resolveResource";

export type { ResolveResult };

/** The two content types this adapter can act on. */
export type WordPressResourceKind = "post" | "page";

const ROUTE_FOR: Record<WordPressResourceKind, { path: string; noun: string }> = {
  post: { path: "/wp/v2/posts", noun: "post" },
  page: { path: "/wp/v2/pages", noun: "page" },
};

type WpListItem = { id: number; slug: string; title?: { raw?: string; rendered?: string } };

/**
 * Everything of one kind on the site, or null if it could not be read.
 *
 * NULL IS NOT AN EMPTY LIST, the same distinction the Shopify resolver
 * and the adapter's readBlogs both make. "Couldn't reach the site" and
 * "this site has no pages" lead to different sentences, and only one of
 * them is the owner's to fix.
 *
 * DRAFTS AND PRIVATE ITEMS ARE INCLUDED, which is a decision rather
 * than a default. The owner asking Hawlai to set the search title on a
 * page they have not published yet is a normal thing to want, and a
 * resolver that only saw published items would answer "nothing on this
 * site is called that" about a page sitting in their own editor.
 */
export async function listWordPressResources(
  creds: WordPressCreds,
  kind: WordPressResourceKind,
  fetchImpl: typeof fetch = fetch
): Promise<Resource[] | null> {
  const { path } = ROUTE_FOR[kind];
  const result = await wordpressRequest<WpListItem[]>(
    creds,
    `${path}?per_page=100&status=publish,draft,pending,private`,
    {},
    fetchImpl
  );
  if (!result.ok || !Array.isArray(result.data)) return null;
  return result.data.map((item) => ({
    // QUALIFIED HERE — see the header. A bare id is not a reference.
    id: `${kind}:${item.id}`,
    // `raw` is the title as stored. `rendered` has had entities and
    // shortcodes applied, so "Tom &amp; Jerry" would never match what
    // the owner types. The list read goes through wordpressRequest,
    // which forces context=edit, so raw is there.
    title: String(item.title?.raw ?? item.title?.rendered ?? ""),
    handle: String(item.slug ?? ""),
  }));
}

/** The kind a qualified reference names, or null if it is not one. */
export function kindOfRef(ref: string): WordPressResourceKind | null {
  const m = /^(post|page):\d+$/.exec(String(ref ?? "").trim());
  return m ? (m[1] as WordPressResourceKind) : null;
}

/**
 * Which piece of CONTENT the owner meant — post or page, not one or
 * the other.
 *
 * ADDED 23 NOVEMBER 2026, after the live site settled an argument.
 * `propose_page_meta` resolved pages only on WordPress, and pages are
 * the one content type Yoast 28.9 will not expose to the REST API: it
 * registers `_yoast_wpseo_title` for `post` and not for `page`,
 * measured on the item's meta and on the route's OPTIONS schema, and
 * the content-type toggles do not change it. So a pages-only search
 * listing on WordPress was a feature that could never work, while the
 * surface most WordPress businesses actually rank with — their posts —
 * was unreachable.
 *
 * IT DOES NOT ASK THE OWNER WHICH KIND, and that is the point. "Set
 * the search title on my about page" is a sentence about a thing, not
 * about a WordPress taxonomy, and making them say "post" or "page"
 * would be this product asking them to know its plumbing. Both lists
 * are read and matched as one, so an unambiguous name resolves
 * whatever it turns out to be.
 *
 * A TIE STILL ASKS, and the candidates carry their qualified
 * references, so the answer comes back as "page:3" and resolves here
 * exactly. That closes a loop the Shopify path does not have: a post
 * and a page can share a slug, so answering with a handle alone could
 * be ambiguous a second time.
 */
export async function resolveWordPressContent(
  creds: WordPressCreds,
  asked: string,
  fetchImpl: typeof fetch = fetch
): Promise<ResolveResult> {
  const [pages, posts] = await Promise.all([
    listWordPressResources(creds, "page", fetchImpl),
    listWordPressResources(creds, "post", fetchImpl),
  ]);

  // UNREADABLE ONLY IF BOTH FAILED. One kind answering and the other
  // not is a partial read, and reporting "couldn't reach the site"
  // over a list we actually have would be false — but so would
  // silently matching against half the site, so it says which half.
  if (pages === null && posts === null) {
    return {
      ok: false,
      reason: "unreadable",
      message: "Couldn't read this site's pages or posts from WordPress, so I don't know which one you mean.",
      candidates: [],
    };
  }

  const all = [...(pages ?? []), ...(posts ?? [])];

  // A QUALIFIED REFERENCE IS ALREADY AN ANSWER. It is what the clarify
  // card hands back, and treating it as a name to fuzzy-match would
  // turn a decision the owner already made into another question.
  if (kindOfRef(asked)) {
    const hit = all.find((r) => r.id === asked.trim());
    if (hit) return { ok: true, resource: hit, matchType: "handle" };
  }

  const matched = matchResource(asked, all, "site");
  if (!matched.ok && matched.reason === "none_exist") {
    return { ...matched, message: "This site has no pages or posts yet." };
  }
  if (!matched.ok && (pages === null || posts === null)) {
    // Said plainly rather than left as a shorter list. "Nothing is
    // called that" is a different claim from "I could only see half
    // of it", and the owner can act on the second.
    const unread = pages === null ? "pages" : "posts";
    return { ...matched, message: `${matched.message} I couldn't read this site's ${unread}, so that half wasn't searched.` };
  }
  return matched;
}

/**
 * List and match in one call — what a producer actually wants.
 *
 * Kept separate from the two halves so a tool that already holds the
 * list, because it just showed the owner the candidates, does not read
 * the site twice.
 */
export async function resolveWordPressResource(
  creds: WordPressCreds,
  kind: WordPressResourceKind,
  asked: string,
  fetchImpl: typeof fetch = fetch
): Promise<ResolveResult> {
  const all = await listWordPressResources(creds, kind, fetchImpl);
  if (all === null) {
    return {
      ok: false,
      reason: "unreadable",
      message: `Couldn't read this site's ${ROUTE_FOR[kind].noun}s from WordPress, so I don't know which one you mean.`,
      candidates: [],
    };
  }
  const matched = matchResource(asked, all, "site");
  // The noun belongs in the sentence, and only this function knows it.
  if (!matched.ok && matched.reason === "none_exist") {
    return { ...matched, message: `This site has no ${ROUTE_FOR[kind].noun}s yet.` };
  }
  return matched;
}
