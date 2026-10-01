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

// ---- invented contact details ---------------------------------------
//
// THE WORST FAILURE THIS FILE HAS SEEN. A generated Contact page said
// "Email: hello@candlebyqaaf.com" — a plausible address on a domain the
// business does not own, so every enquiry sent to it would have gone
// nowhere, silently, for as long as the site stayed up. The owner found
// it by reading their own page.
//
// Nothing in Hawlai stores a public contact email, a public phone number
// or a social handle for a business, so there was nothing to check
// against and the model filled the gap the way models do.
//
// A wrong claim is an argument. A wrong email address is a lost customer
// with no trace, which is why this is removed rather than warned about.

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
/**
 * Indian mobile numbers, however they are spaced.
 *
 * "+91 91234 56789" is the same number as "9123456789" and a pattern
 * demanding ten contiguous digits misses it — which is exactly how one
 * survived the first version of this check. Ten digits opening 6-9, with
 * optional country code and separators anywhere inside.
 */
// The `i` flag means nothing for digits and everything for the label
// withLabel() wraps around this: without it "Call us at" did not match
// its own pattern and the words were left standing with no number.
const PHONE = /(?:\+?91[\s-]?)?\b[6-9]\d{1,4}[\s-]?\d{2,5}[\s-]?\d{2,5}\b/gi;
/** A social handle. Emails are taken out first, so this cannot catch one. */
const HANDLE = /(?<![\w.@])@[a-z0-9._]{2,30}\b/gi;

/**
 * The words that introduce a contact detail, taken out with it.
 *
 * "Email: " left behind when the address goes reads worse than nothing,
 * and so does "Call us at today." — so the label and any preposition are
 * matched as part of the value rather than cleaned up afterwards, which
 * is the only way to know they belonged to it.
 */
const LABEL = "(?:e-?mail|phone|call|whatsapp|instagram|facebook|mobile|tel|reach|write|contact|dm)(?:\\s+(?:us|me))?(?:\\s+(?:at|on|via|to))?\\s*[:—–-]?\\s*";

function withLabel(value: RegExp): RegExp {
  return new RegExp(`(?:\\b${LABEL})?(?:${value.source})`, value.flags);
}

/** Every contact value the business itself has put on record, normalised. */
function allowedContacts(f: BusinessFacts): Set<string> {
  const said: string[] = [];
  for (const k of f.ownerFacts ?? []) said.push(String(k.title ?? ""), String(k.content ?? ""));
  if (f.brand?.description) said.push(String(f.brand.description));
  for (const p of f.products) said.push(p.name, String(p.description ?? ""));
  if (f.links?.store) said.push(f.links.store);
  if (f.links?.booking) said.push(f.links.booking);
  for (const p of f.links?.products ?? []) said.push(p.url);
  const blob = said.join(" \n ");
  const found = new Set<string>();
  for (const re of [EMAIL, PHONE, HANDLE]) for (const m of blob.match(re) ?? []) found.add(m.toLowerCase().trim());
  return found;
}

/**
 * Take out every contact detail the business has not actually given.
 *
 * Deliberately NOT replaced with a placeholder: this text is public, and
 * "[add your email]" on a live Contact page is its own kind of wrong. The
 * value is removed and the owner is told, by name, what was missing — so
 * they add the real one rather than finding a fake one months later.
 *
 * Street addresses are not detected. There is no pattern for one that
 * does not also match ordinary prose, so those are left to the prompt
 * rule and the claims review list.
 */
export function scrubInventedContacts(text: string, f: BusinessFacts): { text: string; removed: string[] } {
  const allowed = allowedContacts(f);
  const removed: string[] = [];
  let out = text;
  const strip = (value: RegExp, what: string) => {
    out = out.replace(withLabel(value), (match) => {
      // The label came along for the ride; the VALUE is what is checked
      // against what the business has on record.
      const found = match.match(new RegExp(value.source, value.flags.replace("g", "")));
      const detail = (found?.[0] ?? match).toLowerCase().trim();
      if (allowed.has(detail)) return match;
      removed.push(`${what} "${(found?.[0] ?? match).trim()}" — this business has no ${what} on record, so it was invented`);
      return "";
    });
  };
  strip(EMAIL, "email address");
  strip(PHONE, "phone number");
  strip(HANDLE, "social handle");
  if (removed.length) {
    out = out
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([.,;])/g, "$1")
      .replace(/^[\s—–-]+|[\s—–-]+$/g, "")
      .trim();
  }
  return { text: out, removed };
}

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
    // Contact details first: an invented email is not a claim to argue
    // with, it is an address that swallows enquiries.
    const contacts = scrubInventedContacts(value, facts);
    removed.push(...contacts.removed);
    const result = stripUnsupported(contacts.text, facts, mode);
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
