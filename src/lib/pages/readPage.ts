// What the page says right now, with an address for each line.
//
// WHY CHAT COULDN'T EDIT A PAGE BEFORE THIS: it could propose new
// wording for the homepage hero and nothing else. "Ye line hata do" and
// "isko chhota karo" had no target — the tool took a headline, a
// subheadline and a button label, matched a section by its heading, and
// guessed. Asked to shorten a paragraph it had never seen, it wrote a new
// one.
//
// So the editor starts here: every piece of text on the page, with the
// block id and prop name that identify it. An instruction about a line
// resolves to one addressable target, or to a refusal that lists what
// IS on the page — never to an edit somewhere else.
//
// Not a new extractor. The text keys are the ones blocksText, the claims
// review, the SEO audit and the block guard all read, so "the words on
// the page" means the same thing in all five places.

import { isLegalPage } from "@/lib/seo/pageKinds";
import { TEXT_PROPS, type TextProp, ownerWroteProp } from "./provenance";

export { TEXT_PROPS };
export type { TextProp };

/**
 * The flat fields a page used before the block builder, mapped to the
 * prop they became.
 *
 * Read here as well as in the claims review because both now use this
 * one reader: a line the review checks has to be a line this can see,
 * and a legacy node has no block id at all — which is how a live page
 * stayed invisible to a walk that only read props.
 */
const LEGACY_FIELDS: [string, TextProp][] = [
  ["headline", "heading"],
  ["subheadline", "heading"],
  ["heading", "heading"],
  ["title", "heading"],
  ["body", "html"],
  ["text", "text"],
  ["ctaText", "label"],
  ["buttonText", "label"],
  ["cta", "label"],
];

export type PageLine = {
  /** The block this text belongs to, or null on a page with no ids yet. */
  blockId: string | null;
  /** Which prop of that block. */
  prop: TextProp;
  /** The block's own type, so chat can say "the heading" or "the button". */
  blockType: string;
  /** What it says now, markup removed for reading. */
  text: string;
  /**
   * Written by Hawlai, or by the owner. Decides whether it is evidence.
   *
   * Read PER PROP (src/lib/pages/provenance.ts). A block carries one
   * `_source`, so reading it per block meant editing a heading marked
   * the paragraph beside it as the owner's — which exempted it from the
   * claims review and made it evidence for itself.
   */
  source: "generated" | "edited" | "unknown";
  /** The flat field this came from, on a page with no block ids. */
  legacyField?: string;
};

export type PageContent = {
  pageId: string;
  slug: string;
  /** The navigation label, which is NOT the search title. */
  title: string | null;
  pageType: string | null;
  lines: PageLine[];
  /** True when this page's words carry obligations rather than marketing. */
  legal: boolean;
  /** True when the page is driven by the catalogue, not by page text. */
  catalogueDriven: boolean;
  /** Set when the page was stored in the pre-block shape. */
  legacyShape: boolean;
};

/**
 * A page whose content comes from the catalogue.
 *
 * Editing the words around a product list is editing a label on data
 * that lives somewhere else. The price, the name and the description
 * belong to the product row, and propose_price_change is the tool that
 * changes them with its own approval card — so a page-text edit here is
 * refused and pointed there rather than writing a second, divergent copy
 * of the same fact onto a page.
 */
const CATALOGUE_TYPES = /(product|products|shop|store|catalog|catalogue|pricing)/i;
const CATALOGUE_BLOCKS = /(product_catalog|product_grid|products|pricing)/i;

export function isCatalogueDriven(page: { slug?: string | null; page_type?: string | null; pageType?: string | null }, sections?: unknown): boolean {
  const slug = String(page.slug ?? "");
  const type = String(page.page_type ?? page.pageType ?? "");
  if (CATALOGUE_TYPES.test(slug) || CATALOGUE_TYPES.test(type)) return true;
  // A catalogue block on an otherwise ordinary page makes that PAGE
  // catalogue-driven too — a "Shop" section dropped onto Home.
  let found = false;
  const walk = (node: unknown): void => {
    if (found || !node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    const b = node as Record<string, any>;
    if (typeof b.type === "string" && CATALOGUE_BLOCKS.test(b.type)) {
      found = true;
      return;
    }
    walk(b.children);
  };
  if (sections !== undefined) walk(sections);
  return found;
}

/** Whether a stored sections array predates the block builder. */
export function isLegacyShape(sections: unknown): boolean {
  if (!Array.isArray(sections) || sections.length === 0) return false;
  // A block always carries props; a legacy node carries its fields flat.
  return sections.some((node) => node && typeof node === "object" && !(node as any).props && !(node as any).children);
}

function readable(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Every addressable line on a page, in the order a visitor reads them.
 *
 * Only blocks that HAVE an id are returned. A legacy node has none, so a
 * legacy page comes back with `legacyShape: true` and no lines — which
 * is the signal to convert it before editing, not a claim that the page
 * is empty.
 */
export function pageLines(sections: unknown): PageLine[] {
  const lines: PageLine[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const b = node as Record<string, any>;
    const id = typeof b.id === "string" ? b.id : null;

    if (b.props && typeof b.props === "object") {
      for (const prop of TEXT_PROPS) {
        const value = b.props[prop];
        if (typeof value !== "string") continue;
        const text = readable(value);
        if (!text) continue;
        // Per prop, not per block.
        const source: PageLine["source"] = ownerWroteProp(b.props, prop)
          ? "edited"
          : b.props._source === "generated" || b.props._source === "edited"
          ? "generated"
          : "unknown";
        lines.push({ blockId: id, prop, blockType: String(b.type ?? "block"), text, source });
      }
    } else {
      // A PAGE FROM BEFORE THE BLOCK BUILDER. Its words live in flat
      // fields and it has no id, so it was invisible to every reader
      // that started from props — which is how the About page's claims
      // never reached the review list.
      for (const [key, prop] of LEGACY_FIELDS) {
        const value = b[key];
        if (typeof value !== "string") continue;
        const text = readable(value);
        if (!text) continue;
        lines.push({ blockId: id, prop, blockType: String(b.type ?? "block"), text, source: "unknown", legacyField: key });
      }
    }

    walk(b.children);
  };
  walk(sections);
  return lines;
}

/** One page, read for editing. */
export function readPageContent(page: {
  id: string;
  slug: string;
  title: string | null;
  page_type?: string | null;
  sections: unknown;
}): PageContent {
  return {
    pageId: page.id,
    slug: page.slug,
    title: page.title,
    pageType: page.page_type ?? null,
    lines: pageLines(page.sections),
    legal: isLegalPage(page),
    catalogueDriven: isCatalogueDriven(page, page.sections),
    legacyShape: isLegacyShape(page.sections),
  };
}

/**
 * One line, found by what the owner said about it.
 *
 * Exact text first, then a containment match, then a loose word overlap
 * — and NO match rather than a best guess. The predecessor matched a
 * section by heading and fell through to the hero when it found nothing,
 * which is how "rewrite the Diwali Gifting section" rewrote the hero and
 * reported success.
 */
export function findLine(lines: PageLine[], wanted: string): { line: PageLine; how: "exact" | "contains" | "words" } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const want = norm(wanted);
  if (!want) return null;

  const exact = lines.find((l) => norm(l.text) === want);
  if (exact) return { line: exact, how: "exact" };

  const contains = lines.filter((l) => norm(l.text).includes(want) || want.includes(norm(l.text)));
  if (contains.length === 1) return { line: contains[0], how: "contains" };

  const words = want.split(" ").filter((w) => w.length > 3);
  if (words.length === 0) return null;
  let best: { line: PageLine; score: number } | null = null;
  for (const line of lines) {
    const hay = norm(line.text);
    const score = words.filter((w) => hay.includes(w)).length;
    if (score === 0) continue;
    // A tie is an ambiguity, not a winner: leave it unresolved so the
    // caller asks instead of picking.
    if (best && score === best.score) return null;
    if (!best || score > best.score) best = { line, score };
  }
  // More than half the distinctive words, or it isn't this line.
  return best && best.score * 2 > words.length ? { line: best.line, how: "words" } : null;
}
