// "Claims on your site" — Stage 2.
//
// Stage 1 stopped the website builder writing unchecked copy and recorded
// who wrote what. This is the other half: the pages already live, written
// before any of that existed, and the owner deciding one line at a time.
//
// THE RULE THAT MAKES IT NECESSARY. The claims guard checks copy against
// knownText() — everything the business says about itself — and
// knownText() reads the business's own website. The website was written
// by a machine. So a line Hawlai invented became the evidence that
// approved the same line everywhere else: "No paraffin. No synthetic
// shortcuts." reached a live homepage unchecked and from then on backed
// every future mention of paraffin. The claim backed itself.
//
// Excluding machine-written text from the evidence closes that loop, and
// doing it without asking would strip an owner's existing copy on their
// next generation with no warning. So they go through the list first:
// Keep — it's true (which writes it into Business Knowledge, making them
// the source), Edit, or Remove from the page. Only after that does the
// exclusion apply to their business.
//
// NOTHING HERE DELETES ANYTHING. Every write happens because the owner
// pressed something.

import { blocksText, ownerWritten } from "./businessFacts";
import { isLegalPage } from "@/lib/seo/pageKinds";
import { findUnsupportedClaims } from "./claimCheck";
import { scrubInventedContacts } from "./guardBlocks";
import type { BusinessFacts } from "./businessFacts";

type Row = Record<string, any>;

export type ReviewItem = {
  pageId: string;
  pageSlug: string;
  pageTitle: string;
  /** Which block holds it, so Remove can take out the sentence and nothing else. */
  blockId: string | null;
  field: "text" | "heading" | "html" | "label";
  /** The sentence as it appears on the page. */
  sentence: string;
  /** Why it is here, in the words the owner reads. */
  reason: string;
  kind: "claim" | "comparative" | "contact" | "offer";
  /**
   * The exact words being flagged, when they can be isolated from the
   * sentence around them.
   *
   * This is what Keep attests, and the reason it matters: the Contact
   * page's Instagram line mixes a REAL handle with "restock alerts"
   * nobody has promised. Attesting the whole sentence would quietly make
   * the restock alerts true as well.
   */
  claim: string | null;
  /**
   * Whether "Keep — it's true" is offered at all.
   *
   * False for two reasons, both deliberate. A comparative claim about
   * someone else's product — "safer than mass-market paraffin" — is not
   * the owner's to attest: it is a statement about a category of goods
   * they do not make, and Hawlai has nothing to check it against no
   * matter who says it. And a flag whose exact words cannot be isolated
   * cannot be scoped, so keeping it would attest more than was flagged.
   */
  keepable: boolean;
  /** What the sentence becomes if Remove is pressed — shown before it is. */
  removeLeaves: string;
  /**
   * Whether "Remove from page" is offered.
   *
   * False on a legal page whose sentence carries more than the flagged
   * words. Remove takes the WHOLE sentence, and a sentence in Terms or a
   * Privacy Policy usually states an obligation alongside whatever was
   * flagged — "every candle is hand-poured in small batches, so slight
   * variations in colour are natural and not defects" is a returns
   * position, not a marketing line. Deleting it to clear a claims flag
   * would quietly change what the business has told its customers.
   *
   * Edit stays available: the owner may absolutely change that sentence,
   * with their eyes on it.
   */
  removable: boolean;
};

/**
 * The flagged words, pulled out of the reason that named them.
 *
 * Every pattern in the claims guard reports itself as `"the words" — why`,
 * so the quoted span is the claim and the rest is the explanation. A few
 * report a kind rather than a quote ("a star rating", "free shipping")
 * and those return null, which is what withholds Keep: a claim that
 * cannot be named cannot be attested in the owner's name.
 */
/**
 * Whether the flagged words ARE the sentence, give or take its full stop.
 *
 * Case-insensitive: the guard reports a term in its own lowercase form
 * ("handmade"), and the page says "Handmade." — the same sentence.
 */
export function isWholeSentence(claim: string, sentence: string): boolean {
  const bare = (value: string) => value.replace(/[.!?]+\s*$/, "").trim().toLowerCase();
  return bare(claim) === bare(sentence);
}

export function claimPhraseOf(reason: string): string | null {
  const quoted = reason.match(/^"([^"]{2,120})"/);
  return quoted ? quoted[1] : null;
}

/** Flat fields on a pre-block page, mapped to the field name an item reports. */
const LEGACY_FIELDS: [string, "text" | "heading" | "html" | "label"][] = [
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

/**
 * Offers a page can promise that a business may not actually run.
 *
 * A NAMED LIST, not general detection. Working out from prose whether a
 * business does bulk orders is not something a pattern can do; what it
 * can do is notice the specific promises that turn into an email from a
 * customer expecting something — and check whether anything in the
 * catalogue or the owner's own words mentions it.
 */
const OFFER_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bgift\s*(?:set|sets|hamper|hampers|box|boxes)\b/i, name: "gift sets" },
  { pattern: /\b(?:bulk|wholesale|corporate)\s*(?:order|orders|enquir|pricing|gifting)/i, name: "bulk or corporate orders" },
  { pattern: /\brestock\s*(?:alert|alerts|notification)/i, name: "restock alerts" },
  { pattern: /\b(?:custom|personalis|personaliz|bespoke)\w*\s*(?:order|orders|set|sets|gift|gifts|label|labels)/i, name: "custom orders" },
  { pattern: /\bsubscription\b|\bmonthly\s*box\b/i, name: "a subscription" },
  { pattern: /\bwedding\s*(?:favour|favor|favours|favors|gift|gifts)\b/i, name: "wedding favours" },
  { pattern: /\bgift\s*wrap\w*\b/i, name: "gift wrapping" },
  { pattern: /\bsample\s*(?:pack|packs|set|sets)\b|\bfree\s*sample/i, name: "samples" },
  { pattern: /\bworkshop\b|\bclass\b/i, name: "workshops" },
];

/** Whether the business's own records mention this offer anywhere. */
function offerIsOnRecord(name: RegExp, f: BusinessFacts): boolean {
  const said: string[] = [];
  for (const p of f.products) said.push(p.name, String(p.description ?? ""));
  for (const o of f.offers) said.push(o.label);
  for (const k of f.ownerFacts ?? []) said.push(String(k.title ?? ""), String(k.content ?? ""));
  if (f.brand?.description) said.push(String(f.brand.description));
  return name.test(said.join(" \n "));
}

/** Sentences, kept whole, with their markup taken off. */
export function sentencesOf(value: string): string[] {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/**
 * Every line on a page that the business cannot currently back up.
 *
 * Only blocks Hawlai wrote. A line the owner has edited is theirs, and
 * putting it on a review list would be telling them their own sentence
 * needs their approval.
 */
export function reviewPage(
  page: { id: string; slug: string; title?: string | null; sections?: unknown },
  facts: BusinessFacts
): ReviewItem[] {
  const items: ReviewItem[] = [];
  const pageTitle = String(page.title ?? page.slug);

  /** Add every flag found in one field of one block. */
  const review = (blockId: string | null, field: "text" | "heading" | "html" | "label", value: unknown): void => {
    if (typeof value !== "string" || !value.trim()) return;
    const base = { pageId: page.id, pageSlug: page.slug, pageTitle, blockId, field };

    for (const sentence of sentencesOf(value)) {
      const add = (reason: string, kind: ReviewItem["kind"], claim: string | null, keepable: boolean) => {
        items.push({
          ...base,
          sentence,
          reason,
          kind,
          claim,
          // Keep is offered only when the exact words can be named: an
          // attestation has to be about something specific.
          keepable: keepable && Boolean(claim),
          removeLeaves: withoutSentence(String(value), sentence),
          // On a legal page, only a sentence that is nothing BUT the
          // flagged claim may be removed from here.
          removable: !isLegalPage(page) || !claim || isWholeSentence(claim, sentence),
        });
      };

      // A contact detail nobody gave us. First, because it is the one
      // that costs a customer rather than an argument.
      const contacts = scrubInventedContacts(sentence, facts);
      for (const reason of contacts.removed) add(reason, "contact", claimPhraseOf(reason), true);

      // An offer the page promises and nothing on record mentions.
      for (const { pattern, name } of OFFER_PATTERNS) {
        if (!pattern.test(sentence)) continue;
        if (offerIsOnRecord(pattern, facts)) continue;
        const match = sentence.match(pattern);
        add(`this page offers ${name}, and nothing in your catalogue or Business Knowledge mentions it`, "offer", match ? match[0] : name, true);
      }

      // And everything the ordinary claims check flags. A comparison
      // with someone else's product is its own category: see keepable.
      for (const reason of findUnsupportedClaims(sentence, facts)) {
        const comparative = /a comparison with competitors/.test(reason);
        add(reason, comparative ? "comparative" : "claim", claimPhraseOf(reason), !comparative);
      }
    }
  };

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const b = node as Row;
    const blockId = typeof b.id === "string" ? b.id : null;

    if (b.props && typeof b.props === "object") {
      const props = b.props as Row;
      if (props._source !== "edited") {
        for (const field of ["text", "heading", "html", "label"] as const) review(blockId, field, props[field]);
      }
    } else {
      // A PAGE FROM BEFORE THE BLOCK BUILDER, and skipping these is why
      // a live comparative health claim never reached the list: a legacy
      // node keeps its words in flat fields (headline, subheadline,
      // body, ctaText) and has no `props` at all, so a walk that only
      // read props saw nothing on those pages. blocksText has always
      // handled both shapes; this did not.
      for (const [key, field] of LEGACY_FIELDS) review(blockId, field, b[key]);
    }
    walk(b.children);
  };

  walk(page.sections);
  return items;
}

/**
 * Facts with the machine's own writing taken out of the evidence.
 *
 * What the review list is measured against: the site cannot vouch for
 * itself. Owner-edited blocks stay, because those words are the owner's.
 */
export function factsWithoutGeneratedCopy(facts: BusinessFacts, pages: Row[]): BusinessFacts {
  const ownPages = (facts.site?.pages ?? []).map((sitePage) => {
    const row = pages.find((p) => p.slug === sitePage.slug);
    const kept = blocksText(ownerWritten(row?.sections));
    return { ...sitePage, headings: kept.headings, paragraphs: kept.paragraphs, buttons: kept.buttons, metaDescription: null };
  });
  return { ...facts, site: facts.site ? { ...facts.site, pages: ownPages } : null, home: ownPages.find((p) => p.slug === "home") ?? facts.home };
}

/** The sentence taken out of one field, leaving the rest of it alone. */
export function withoutSentence(value: string, sentence: string): string {
  const target = sentence.trim();
  if (!target) return value;
  // Matched on the text as a reader sees it, so a sentence spanning a
  // tag boundary is still found — then removed from the markup by the
  // same literal, which is how it was extracted in the first place.
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return value
    .replace(new RegExp(escaped, "i"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/<p>\s*<\/p>/gi, "")
    .trim();
}
