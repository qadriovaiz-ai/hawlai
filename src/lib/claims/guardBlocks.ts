// The claims check, applied to a generated website's blocks.
//
// WHY THE WEBSITE BUILDER NEEDED THIS LAST, AND NEEDED IT MOST: Content,
// Email, Paid Ads, Retargeting, WhatsApp and (since 2026-09-29) SEO all
// run their copy through the guard. The builder never did — and it writes
// the pages that knownText() then treats as evidence. So an unchecked
// line became the proof that approved the same claim everywhere else:
// "No paraffin. No synthetic shortcuts." went onto a homepage unguarded,
// and from there it backed every future mention of paraffin.
//
// WHY NOT guardGenerated ON THE WHOLE TREE: that walks every string in
// the object, which here includes hrefs, alignments, background tokens
// and block ids. Rewriting those is collateral damage — a stripped href
// is a broken link, not a safer page. This touches only the fields that
// hold words a customer reads.
//
// WHAT HAPPENS TO A LINE THAT LOSES EVERYTHING: it is replaced, never
// left blank. An empty hero is worse than an unsupported one — the owner
// sees a broken page and no explanation. The replacement is built from
// counted facts only: the category, the city, the real catalogue. Those
// need no evidence because they ARE the evidence.

import { businessDisplayName } from "@/lib/business/displayName";
import { stripUnsupported, type ClaimsMode } from "./claimCheck";
import type { BusinessFacts } from "./businessFacts";

type Row = Record<string, any>;

/** Block props that hold words a visitor reads. Everything else is left alone. */
const BLOCK_TEXT_KEYS = ["text", "heading", "html", "label"] as const;
/** The same, on pages written before the block builder. */
const LEGACY_TEXT_KEYS = ["headline", "subheadline", "heading", "body", "text", "ctaText", "buttonText", "cta"] as const;

/** A heading anyone can stand behind: what this business is, and where. */
export function groundedHeading(f: BusinessFacts): string {
  const category = f.categoryKnown && f.category ? f.category : "";
  const where = f.city ? `in ${f.city}` : "";
  return [category, where].filter(Boolean).join(" ").trim() || businessDisplayName(f.businessName);
}

/** A paragraph made only of things the business has on record. */
export function groundedParagraph(f: BusinessFacts): string {
  const parts: string[] = [];
  if (f.city) parts.push(`Made in ${f.city}.`);
  const named = f.products.filter((p) => p.active !== false).slice(0, 3).map((p) => `${p.name} (₹${p.price})`);
  if (named.length) parts.push(`${named.join(", ")}.`);
  if (parts.length === 0 && f.brand?.description) parts.push(String(f.brand.description).trim());
  return parts.join(" ") || `Get in touch with ${businessDisplayName(f.businessName)}.`;
}

export type BlockGuardResult = {
  blocks: unknown;
  /** Every claim taken out, in the guard's own words, for the owner. */
  removed: string[];
  /** How many fields were emptied and rebuilt from facts. */
  replaced: number;
};

/**
 * Strip unsupported claims from a block tree, keeping the page usable.
 *
 * Returns a new tree; the input is not modified.
 */
export function guardBlockTree(blocks: unknown, facts: BusinessFacts | null | undefined, mode: ClaimsMode = "publish"): BlockGuardResult {
  const removed: string[] = [];
  let replaced = 0;
  if (!facts) return { blocks, removed, replaced };

  /**
   * Whether anything a reader would SEE is left.
   *
   * Markup does not count. A Text block holds "<p>…</p>", and when every
   * sentence inside is removed what remains is "</p>" — not empty, not
   * words either. Trusting `.trim()` there published a block whose entire
   * content was a closing tag.
   */
  const hasWords = (value: string) => value.replace(/<[^>]*>/g, "").trim().length > 0;

  const clean = (value: unknown, kind: "heading" | "paragraph" | "button"): unknown => {
    if (typeof value !== "string" || !value.trim()) return value;
    const result = stripUnsupported(value, facts, mode);
    removed.push(...result.removed);
    if (hasWords(result.text)) return result.text;
    // Everything in it was a claim. A blank heading is not a safer page,
    // it is a broken one.
    replaced += 1;
    const wasHtml = /<[a-z][^>]*>/i.test(value);
    if (kind === "button") return "Get in touch";
    if (kind === "heading") return groundedHeading(facts);
    return wasHtml ? `<p>${groundedParagraph(facts)}</p>` : groundedParagraph(facts);
  };

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const b = { ...(node as Row) };

    if (b.props && typeof b.props === "object") {
      const props: Row = { ...b.props };
      for (const key of BLOCK_TEXT_KEYS) {
        if (props[key] === undefined) continue;
        props[key] = clean(props[key], key === "label" ? "button" : key === "html" ? "paragraph" : "heading");
      }
      b.props = props;
    } else {
      for (const key of LEGACY_TEXT_KEYS) {
        if (b[key] === undefined) continue;
        b[key] = clean(b[key], key === "ctaText" || key === "buttonText" || key === "cta" ? "button" : key === "body" ? "paragraph" : "heading");
      }
    }

    if (b.children) b.children = walk(b.children);
    return b;
  };

  return { blocks: walk(blocks), removed, replaced };
}

/**
 * Mark every block as machine-written.
 *
 * Read by the "Claims on your site" review and, later, by the evidence
 * rule: a line Hawlai wrote cannot be the proof that the same line is
 * true. Cleared per block when the owner edits it in Website Builder.
 */
export function markGenerated(blocks: unknown): unknown {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const b = { ...(node as Row) };
    if (b.props && typeof b.props === "object") b.props = { ...b.props, _source: "generated" };
    if (b.children) b.children = walk(b.children);
    return b;
  };
  return walk(blocks);
}
