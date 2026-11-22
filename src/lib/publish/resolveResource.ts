// Which thing the owner meant — one matcher, every platform.
//
// MOVED HERE FROM shopifyResources.ts ON 22 NOVEMBER 2026, unchanged in
// behaviour, when WordPress needed exactly the same decision. The
// alternative was a second copy, and this codebase has a long record of
// what a second copy costs: `metaTitle` against `seoTitle` for the same
// ActionKey, `_source` read two ways, the same four TEXT_PROPS declared
// six times. Two matchers would drift the first time one of them
// learned something.
//
// `matchShopifyResource` is now a thin delegate, so every assertion
// already written against it still exercises this code.
//
// PLATFORM-NEUTRAL BY SHAPE, NOT BY ACCIDENT. Everything below works on
// `{ id, title, handle }`, which is what a Shopify gid-plus-handle and
// a WordPress id-plus-slug both reduce to. The nouns travel as
// arguments because they belong in the sentence the owner reads — "this
// store has no collections" and "this site has no pages" are the same
// refusal about different things.

/** One thing the owner might have meant. */
export type Resource = {
  /** The reference the adapter needs — a gid, or "page:7". */
  id: string;
  /** What the owner calls it. */
  title: string;
  /** The URL slug, which is often what they type. */
  handle: string;
};

export type ResolveResult =
  | { ok: true; resource: Resource; matchType: "handle" | "title" | "only_one" }
  /**
   * Could not tell. Carries what DOES exist, because the one useful
   * reply to "which page?" is the list.
   *
   * `needs_confirmation` carries ONE candidate and means "did you mean
   * this?" — kept distinct from `ambiguous`, which carries several and
   * means "which of these?". Different sentences, and the owner can
   * answer the first one with a yes.
   */
  | {
      ok: false;
      reason: "needs_confirmation" | "ambiguous" | "none_exist" | "unreadable";
      message: string;
      candidates: Resource[];
    };

/** Case and punctuation folded, so "About Us" matches "about-us". */
export function fold(s: string): string {
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
export function matchResource(asked: string, all: Resource[], place = "store"): ResolveResult {
  const noun = "item";
  if (!all.length) {
    return { ok: false, reason: "none_exist", message: `This ${place} has no ${noun}s yet.`, candidates: [] };
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
    // A LOOSE MATCH IS OFFERED, NEVER APPLIED — even when it is the
    // only one. `ResolutionPath` in publish/resolve.ts is
    // exact | user_clarified | direct, with NO value for "a substring
    // matched and I went ahead", and that absence is a rule rather
    // than an omission: this product's resolution design is that a
    // loose match goes to the owner to confirm. propose_price_change
    // has worked that way since the first version.
    //
    // So "about" does not silently become /pages/about-us. It comes
    // back as "did you mean About us?", which costs one turn and
    // removes a whole class of wrong target on a live storefront.
    if (loose.length === 1) {
      return {
        ok: false,
        reason: "needs_confirmation",
        message: `Did you mean "${loose[0].title}"?`,
        candidates: loose,
      };
    }
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
    message: wanted ? `Nothing on this ${place} is called "${asked}".` : "Which one did you mean?",
    candidates: all,
  };
}
