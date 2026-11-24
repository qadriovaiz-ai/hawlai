// A page with no search title, and what to propose for it — S-a/S-b.
//
// ──────────────────────────────────────────────────────────────────
// WHAT THIS IS, AND WHY IT IS SMALL.
//
// The audit has found these gaps since it was written —
// `pages_without_search_title` and `pages_without_meta_description`,
// two of its nine finding types. They reached the owner as a sentence
// in an email and stopped there. This turns each one into a proposal
// he can approve, through `update_page_meta`, which is already
// reversible and already the single entry in L2_ALLOWLIST.
//
// NO MODEL CALL, DELIBERATELY, and that is most of why this is safe.
// A title is the page's own title plus the business's name; a
// description is the page's own first sentences. Neither invents
// anything, so there is no generation to go wrong, nothing to bill,
// and no AI-failure path to handle.
//
// IT STILL GOES THROUGH THE CLAIMS DOOR, and the reason is not
// obvious: copying the page's own words is not neutral. If the page
// says "India's best candles", putting that in the meta description
// republishes the claim into the search result, where it is MORE
// prominent than on the page. So the proposed copy is guarded like any
// other generated copy — the guard is the point, not the generator.
//
// ──────────────────────────────────────────────────────────────────
// WHAT IS NOT HERE: `pages_still_fallback`.
//
// The third page-SEO finding is a page whose body is still the
// builder's placeholder, and fixing it means WRITING THE PAGE — real
// copy, from facts, with a model. That is A6's generator, not this,
// and pretending otherwise would put the riskiest piece of the SEO
// work inside the safest commit. It stays a finding in the email until
// A6 exists.
// ──────────────────────────────────────────────────────────────────

import { businessDisplayName } from "@/lib/business/displayName";
import { META_DESCRIPTION_LIMIT } from "@/lib/seo/metaLength";

/** The slug the site builder gives an untouched home page. */
const DEFAULT_HOME_LABEL = "home";

/** Shortest description worth proposing. Below this it says nothing. */
export const MIN_DESCRIPTION = 50;

export type PageRow = {
  id: string;
  slug: string;
  title?: string | null;
  seo_title?: string | null;
  meta_description?: string | null;
  sections?: unknown;
  is_fallback?: boolean | null;
};

export type MetaGap = {
  pageId: string;
  slug: string;
  /** Which field is missing. One gap per field, so one card decides one thing. */
  field: "seoTitle" | "metaDescription";
  /** What to put there. */
  value: string;
  /** For the audit row, so `target_ref` alone is not the whole story. */
  label: string;
};

/**
 * Every readable string in a block tree, in order.
 *
 * GENERIC OVER PROP NAMES, the same choice `aeoAgent` made and for the
 * same reason: block types disagree about whether their text lives in
 * `heading`, `body`, `text` or `html`, and all this needs is real
 * words in reading order — not a re-render of the schema.
 */
/**
 * Keys whose values describe the block rather than say anything.
 *
 * WITHOUT THIS, THE BLOCK'S OWN METADATA BECOMES THE DESCRIPTION. The
 * first version walked every value in the tree and produced
 * "text Hand poured soy candles…" — the word `text` is the block's
 * `type`, and it would have gone into a live search result. Caught by
 * this file's own test before any mutation run.
 *
 * A SKIP LIST RATHER THAN AN ALLOW LIST, because the generic walk is
 * the point: block types disagree about whether their copy lives in
 * `heading`, `body`, `text` or `html`, and an allow list would silently
 * miss a block type added later — failing in the direction of an empty
 * description rather than a wrong one, but failing quietly either way.
 */
const SKIP_KEYS = new Set([
  "type", "kind", "id", "slug", "href", "url", "src", "image", "icon",
  "variant", "align", "style", "color", "size", "layout", "theme", "width", "height",
  "contentSource", "content_source", "blockId", "block_id",
]);

/**
 * EXPORTED for the answer planner (A6-a), which needs the same thing
 * for a different reason: to ask whether the site already answers a
 * question. One extractor, so the two cannot disagree about what the
 * page says — and the skip-list reasoning above is the part worth not
 * writing twice.
 */
export function blockText(sections: unknown): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node === "string") {
      // The `html` prop is markdown, not HTML — and it has put raw <p>
      // tags on a live homepage once already. Stripped either way.
      const clean = node.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      // A URL is not a sentence.
      if (clean && !/^(https?:\/\/|\/|#|data:)/i.test(clean)) out.push(clean);
      return;
    }
    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (SKIP_KEYS.has(key)) continue;
        walk(value);
      }
    }
  };
  walk(sections);
  return out;
}

/**
 * The title to propose, or null when there is nothing better to say.
 *
 * THE SAME SHAPE `resolvePageTitle` ALREADY USES for what a browser tab
 * shows — "Page | Business" — so approving this makes explicit what the
 * site was already displaying rather than changing it. That matters:
 * the owner is approving a stored value, and if it read differently
 * from his own page he would be right to refuse.
 *
 * NULL FOR AN UNTOUCHED HOME PAGE. Its only available title is the
 * business name, which is what the tab already falls back to — so
 * storing it changes nothing and spends a decision. A real home-page
 * title needs to say what the business DOES, and that is a sentence
 * from facts, which is A6.
 */
export function proposedSeoTitle(page: PageRow, dealershipName: string | null | undefined): string | null {
  const business = businessDisplayName(dealershipName, "");
  if (!business) return null;

  const pageTitle = String(page.title ?? "").trim();
  if (page.slug === DEFAULT_HOME_LABEL) {
    if (!pageTitle || pageTitle.toLowerCase() === DEFAULT_HOME_LABEL) return null;
    return pageTitle;
  }
  if (!pageTitle) return null;
  // Already carries the business name — "Candles | Candle by Qaaf"
  // would read as a mistake, and does not help anybody.
  if (pageTitle.toLowerCase().includes(business.toLowerCase())) return pageTitle;
  return `${pageTitle} | ${business}`;
}

/**
 * The description to propose, from the page's own words, or null.
 *
 * SENTENCES, NOT A TRUNCATION. A description cut mid-word reads as
 * broken in a search result, so this takes whole sentences up to the
 * limit and proposes nothing when even the first one does not fit.
 *
 * AND IT DOES NOT TRIM SILENTLY. `metaLength`'s own header draws that
 * line: a silent edit is acceptable on a machine's first draft with
 * nobody reviewing, and NOT on a card where a person decides. This is
 * the second kind, so it builds something that already fits instead of
 * cutting something that does not.
 */
export function proposedMetaDescription(page: PageRow): string | null {
  const words = blockText(page.sections).join(" ");
  if (!words) return null;

  const sentences = words.match(/[^.!?]+[.!?]+/g) ?? [];
  let built = "";
  for (const sentence of sentences) {
    const next = `${built} ${sentence.trim()}`.trim();
    if (next.length > META_DESCRIPTION_LIMIT) break;
    built = next;
  }

  // No sentence-ended text short enough. A page of one long sentence is
  // real, so fall back to whole words — still never a mid-word cut.
  if (!built) {
    const room = words.slice(0, META_DESCRIPTION_LIMIT);
    const lastSpace = room.lastIndexOf(" ");
    built = (lastSpace > MIN_DESCRIPTION ? room.slice(0, lastSpace) : "").trim();
  }

  return built.length >= MIN_DESCRIPTION ? built : null;
}

/**
 * Which pages are missing which field, and what to propose.
 *
 * HOME FIRST, then by slug, so the order is stable between runs and
 * the page that matters most is proposed first when the cap bites.
 *
 * A FALLBACK PAGE IS SKIPPED ENTIRELY. Its body is the builder's
 * placeholder, so a description drawn from it would describe the
 * placeholder — and giving a placeholder page a tidy search title is
 * worse than leaving it out of Google, because it invites a visitor to
 * a page with nothing on it.
 */
export function findMetaGaps(pages: PageRow[], dealershipName: string | null | undefined): MetaGap[] {
  const ordered = [...(pages ?? [])].sort((a, b) => {
    if (a.slug === DEFAULT_HOME_LABEL) return -1;
    if (b.slug === DEFAULT_HOME_LABEL) return 1;
    return String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  });

  const gaps: MetaGap[] = [];
  for (const page of ordered) {
    if (!page?.id || page.is_fallback) continue;
    const label = `${page.title || page.slug} page`;

    if (!String(page.seo_title ?? "").trim()) {
      const value = proposedSeoTitle(page, dealershipName);
      if (value) gaps.push({ pageId: page.id, slug: page.slug, field: "seoTitle", value, label });
    }
    if (!String(page.meta_description ?? "").trim()) {
      const value = proposedMetaDescription(page);
      if (value) gaps.push({ pageId: page.id, slug: page.slug, field: "metaDescription", value, label });
    }
  }
  return gaps;
}
