// Changing one line on one page, by its address.
//
// The old path (src/lib/chat/homepageCopy.ts) took a headline, a
// subheadline and a button label, matched a section by its heading, and
// edited the first heading/paragraph/button it found inside. Homepage
// only, three fields only, and no way to refer to a line it hadn't been
// handed. This takes a block id and a prop name — an address read off
// the page itself (src/lib/pages/readPage.ts) — so the thing edited is
// the thing the owner pointed at.
//
// PROVENANCE IS THE DECISION THIS FILE CARRIES, and it is not obvious.
// Approving a draft Hawlai wrote does NOT make the owner the author of
// it: they approved publishing it, not vouching for it. So the block
// stays `_source: "generated"` and the page's content_source does not
// flip. Only text the owner dictated becomes "edited" — which is what
// makes it evidence for the claims check, and what keeps the loop Stage
// 1 broke from reopening through a new door.
//
// THE LIVE BUG THIS FIXES: the page endpoint flipped content_source to
// "edited" whenever the words changed, with no check on who wrote them.
// So every chat-approved Hawlai draft recorded the owner as standing
// behind copy they had only pressed Approve on.

import { scrubInventedContacts } from "@/lib/claims/guardBlocks";
import { stripUnsupported } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { TEXT_PROPS, type TextProp } from "./readPage";
import { withOwnerProp } from "./provenance";

export type EditRequest = {
  blockId: string;
  prop: TextProp;
  /** The wording to put there. */
  text: string;
  /**
   * True when the owner dictated these words rather than approving a
   * draft. Rule C: their wording is never stripped, only warned about —
   * and only this makes the text evidence.
   */
  writtenByOwner?: boolean;
  /**
   * Putting back wording that was on the page before.
   *
   * Not guarded, and provenance left exactly as it was — both
   * deliberately. This text was already published, so the guard has
   * either seen it or it predates the guard; running it again would mean
   * an undo that silently fails to restore the line it is undoing. And
   * whoever wrote it originally still wrote it: an undo is not a new act
   * of authorship, so it must neither claim nor remove the owner's mark.
   */
  restore?: boolean;
};

export type AppliedEdit = {
  blockId: string;
  prop: TextProp;
  blockType: string;
  before: string;
  after: string;
  /** What this block's _source becomes. */
  source: "generated" | "edited";
  /** True when this was putting earlier wording back, not writing new wording. */
  restored?: boolean;
};

export type EditResult = {
  sections: unknown;
  applied: AppliedEdit[];
  /** Addresses that matched no block — nothing was changed for these. */
  missing: { blockId: string; prop: TextProp }[];
  /** Claims taken out of wording HAWLAI wrote. */
  removed: string[];
  /** Contact details taken out because the business has none on record. */
  contactsRemoved: string[];
  /** Said about the owner's own wording instead of editing it. */
  warnings: string[];
  /** True when any applied edit was the owner's own words. */
  ownerAuthored: boolean;
};

/**
 * Apply edits to a block tree. Never mutates the input.
 *
 * The guard runs HERE and not at the write, because the card must show
 * the owner what will actually land on the page — showing them one
 * sentence and publishing a shortened one is the failure the claims card
 * was built to stop.
 */
export function applyEdits(sections: unknown, edits: EditRequest[], facts: BusinessFacts | null | undefined): EditResult {
  const next = JSON.parse(JSON.stringify(sections ?? []));
  const byId = new Map<string, EditRequest[]>();
  for (const edit of edits) {
    if (!TEXT_PROPS.includes(edit.prop)) continue;
    byId.set(edit.blockId, [...(byId.get(edit.blockId) ?? []), edit]);
  }

  const applied: AppliedEdit[] = [];
  const removed: string[] = [];
  const contactsRemoved: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const clean = (value: string, writtenByOwner: boolean): string => {
    if (!facts) return value;
    // Contact details first, and for BOTH authors. An invented email is
    // not a claim to argue with — it is an address that swallows
    // enquiries — and an owner who dictates one they don't own has made
    // a mistake, not a claim. It is pointed out rather than published.
    const contacts = scrubInventedContacts(value, facts);
    if (contacts.removed.length > 0) {
      contactsRemoved.push(...contacts.removed);
      if (writtenByOwner) {
        warnings.push(`You wrote ${contacts.removed.length === 1 ? "a contact detail" : "contact details"} Hawlai has no record of, so ${contacts.removed.length === 1 ? "it was" : "they were"} left off the page: ${contacts.removed.join("; ")}. Add the real one in Business Knowledge and I'll use it.`);
      }
    }
    const claims = stripUnsupported(contacts.text, facts, "publish");
    if (claims.removed.length === 0) return contacts.text;
    // RULE C: the owner's wording is theirs. Warned about, never edited.
    if (writtenByOwner) {
      warnings.push(`Saved exactly as you wrote it. Worth knowing: your Business Story doesn't back up ${claims.removed.join("; ")} — you're the one standing behind that claim.`);
      return contacts.text;
    }
    removed.push(...claims.removed);
    return claims.text;
  };

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const block = { ...(node as Record<string, any>) };
    const wanted = typeof block.id === "string" ? byId.get(block.id) : undefined;

    if (wanted && block.props && typeof block.props === "object") {
      const props = { ...block.props };
      for (const edit of wanted) {
        const before = typeof props[edit.prop] === "string" ? props[edit.prop] : "";
        const after = edit.restore ? String(edit.text) : clean(String(edit.text), Boolean(edit.writtenByOwner));
        // Nothing survived the guard: leave the page as it is rather
        // than emptying a heading. A blank block is not a safer page.
        if (!after.replace(/<[^>]*>/g, "").trim()) continue;
        seen.add(`${edit.blockId}:${edit.prop}`);
        if (before === after) continue;
        // Only the owner's own words make this block evidence. A restore
        // keeps whatever mark the block already carried: putting a line
        // back is not a new act of authorship by anyone.
        const existing = props._source === "edited" || props._source === "generated" ? props._source : undefined;
        const source: AppliedEdit["source"] = edit.restore ? existing ?? "generated" : edit.writtenByOwner ? "edited" : "generated";
        props[edit.prop] = after;
        if (!edit.restore) {
          // Per prop: dictating a new heading must not make the
          // paragraph beside it the owner's word as well.
          if (source === "edited") Object.assign(props, withOwnerProp(props, edit.prop));
          else props._source = "generated";
        }
        applied.push({ blockId: edit.blockId, prop: edit.prop, blockType: String(block.type ?? "block"), before: before.replace(/<[^>]*>/g, "").trim(), after: after.replace(/<[^>]*>/g, "").trim(), source, ...(edit.restore ? { restored: true as const } : {}) });
      }
      block.props = props;
    }

    if (block.children) block.children = walk(block.children);
    return block;
  };

  const out = walk(next);
  const missing = edits.filter((e) => !seen.has(`${e.blockId}:${e.prop}`)).map((e) => ({ blockId: e.blockId, prop: e.prop }));

  return {
    sections: out,
    applied,
    missing,
    removed: Array.from(new Set(removed)),
    contactsRemoved: Array.from(new Set(contactsRemoved)),
    warnings: Array.from(new Set(warnings)),
    ownerAuthored: applied.some((a) => a.source === "edited"),
  };
}

/**
 * Whether this save should record the owner as the author of the page.
 *
 * Both conditions, which is the whole point: the words changed AND the
 * owner wrote them. The page endpoint checked only the first, so
 * approving a Hawlai draft marked the page "edited" — and a line Hawlai
 * wrote became the evidence that the same line was true.
 */
export function contentSourceAfter(applied: AppliedEdit[]): "edited" | null {
  // A restore is excluded: putting a line back changes nothing about who
  // wrote it, so an undo must not make the page the owner's work.
  return applied.some((a) => a.source === "edited" && !a.restored) ? "edited" : null;
}

/**
 * What a legal-page edit must say before it is approved.
 *
 * Privacy and terms copy is read by a customer deciding whether to
 * trust the business and, if something goes wrong, by whoever is
 * settling it. Editable — the owner may genuinely need to change a
 * returns window — but never quietly, and never shortened by the guard
 * on Hawlai's initiative.
 */
export function legalWarning(applied: AppliedEdit[]): string | null {
  if (applied.length === 0) return null;
  const shortened = applied.filter((a) => a.after.length < a.before.length * 0.75);
  return [
    "This is a legal page. The wording here is what a customer relies on and what gets read if there's ever a dispute — check it says what you mean before you approve.",
    shortened.length > 0 ? `${shortened.length === 1 ? "One line gets" : `${shortened.length} lines get`} noticeably shorter: make sure nothing you're obliged to say has gone with it.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Said when the BLOCK's content belongs to the catalogue.
 *
 * Narrowed on 2026-10-03 from refusing the whole page. The Shop page's
 * "The Shop" heading and its intro paragraph are ordinary prose, and
 * refusing them taught the owner that chat could not touch their shop
 * page at all — then the chat asked them for wording it would have
 * refused next, which was worse than the refusal.
 */
export const CATALOGUE_REFUSAL =
  "That block shows your catalogue, so its names, prices and descriptions come from the product rows themselves — changing them on the page would leave two different answers on your site. Tell me what should change about the product and I'll put it through the catalogue instead, with its own approval card. The ordinary headings and paragraphs on that page I can change.";

/** Money, however it is written. */
const PRICE_IN_TEXT = /(?:₹|\brs\.?\s|\binr\s)\s?\d|\b\d[\d,]*(?:\.\d+)?\s*(?:rupees?|rs\b|\/-)/i;

/** Stock and quantity, which live on the product row for the same reason. */
const STOCK_IN_TEXT = /\b(?:only\s+)?\d+\s*(?:left|in\s+stock|remaining|available|units?|pieces?|pcs)\b|\b(?:in|out\s+of)\s+stock\b/i;

/**
 * A price or a stock figure in page text — refused, always.
 *
 * THE RULE, AND IT IS THE RULE RATHER THAN A JUDGEMENT ABOUT THE NUMBER:
 * a price lives on the product row, so a number typed into a paragraph
 * is a second answer on the same site with nothing keeping the two in
 * step. ₹999 is refused exactly as ₹499 is. On 3 Oct 2026 the chat
 * explained a refusal with "₹499 isn't your real price", which invites
 * the owner to retry with the right one — and the right one is still
 * wrong here.
 */
export function statesPriceOrStock(text: string): string | null {
  if (PRICE_IN_TEXT.test(text)) {
    return "I don't put prices in page text at all — not the wrong one and not the right one. The price lives on the product itself, so a number typed into a paragraph would sit beside the catalogue's own figure with nothing keeping the two in step, and whichever changed first would make the other a lie. Ask me to change the product's price and it goes through the catalogue with its own card.";
  }
  if (STOCK_IN_TEXT.test(text)) {
    return "I don't put stock counts in page text. The quantity lives on the product and changes with every order, so a number written into a paragraph is out of date the moment someone buys one. The product page shows it live.";
  }
  return null;
}

/**
 * Words that are the category, not a product.
 *
 * WHY THIS EXISTS: "Shop page ka heading 'The Shop' ko 'Our Candles' kar
 * do" was REFUSED, because the name check read "Our Candles" as a
 * product that isn't in the catalogue. The goal of the whole feature is
 * that every page is editable from chat, and the commonest heading a
 * candle shop could possibly want was the thing it would not allow.
 *
 * A heading is nearly always the category — that is what a heading is
 * for — so the category's own words can never be evidence of a product
 * name. Taken from the business's real category and catalogue rather
 * than a fixed list, plus the words any shop heading uses.
 */
const NAME_STOPWORDS = new Set([
  "the", "our", "my", "your", "all", "new", "best", "more", "shop", "store", "buy", "sale", "sales",
  "collection", "collections", "range", "ranges", "gift", "gifts", "gifting", "home", "handmade",
  "hand", "poured", "made", "craft", "crafted", "small", "batch", "batches", "premium", "luxury",
  "natural", "pure", "fresh", "classic", "signature", "everyday", "essentials", "favourites", "favorites",
  // Materials and forms. "Handmade Soy Candles" is a category heading,
  // not a product nobody sells — and "soy" reached this list only
  // because the vocabulary was built from product NAMES and the word
  // lives in the description.
  "soy", "wax", "beeswax", "coconut", "cotton", "wick", "wicks", "scented", "unscented",
  "fragrance", "fragrances", "aroma", "scent", "scents", "candle", "candles", "jar", "jars", "tin", "tins",
]);

function categoryVocabulary(facts: BusinessFacts): Set<string> {
  const words = new Set<string>(NAME_STOPWORDS);
  const add = (value: string) => {
    for (const word of String(value ?? "").toLowerCase().split(/[^a-z]+/)) {
      if (word.length < 3) continue;
      words.add(word);
      words.add(word.endsWith("s") ? word.slice(0, -1) : `${word}s`);
    }
  };
  // The category itself: a candle business's heading may say "candles".
  if (facts.categoryKnown && facts.category) add(facts.category);
  // And the words its own products are made of. The DESCRIPTION as well
  // as the name: "soy" is in "Hand-poured soy wax" and nowhere in
  // "Lavender candle", which is how "Handmade Soy Candles" came to read
  // as a product nobody sells.
  for (const product of facts.products) {
    add(product.name);
    add(String(product.description ?? ""));
  }
  return words;
}

/**
 * A product name on the page that the catalogue does not have.
 *
 * Returns the phrase, or null. Only a phrase with at least one word that
 * is NOT part of the category's vocabulary counts: "Our Candles" is the
 * category, "Midnight Oud Candle" is a product nobody sells.
 *
 * The CALLER decides what to do with it, and the two answers differ.
 * Rule C: wording the owner dictated is saved verbatim and warned about,
 * because a name they typed may be a product they are about to add or a
 * phrase Hawlai simply does not recognise — neither is ours to refuse.
 * Wording HAWLAI wrote is refused, because inventing a product is how a
 * customer comes to ask for something nobody can send.
 */
export function unknownProductName(text: string, facts: BusinessFacts | null | undefined): string | null {
  if (!facts) return null;
  const vocabulary = categoryVocabulary(facts);
  const known = facts.products.map((p) => p.name.toLowerCase());

  // The leading words must be capitalised — that is what makes it read
  // as a name rather than prose — but the noun may be either case.
  for (const candidate of text.match(/\b(?:[A-Z][a-z]+\s){1,3}(?:[Cc]andles?|[Ss]ets?|[Jj]ars?|[Kk]its?|[Bb]ox(?:es)?|[Hh]ampers?)\b/g) ?? []) {
    const phrase = candidate.trim();
    const lower = phrase.toLowerCase();
    if (known.some((name) => name.includes(lower) || lower.includes(name))) continue;
    // Every word is the category or a shop word: this is a heading, not
    // a product. "Our Candles", "The Candle Shop", "Shop All Candles".
    const words = lower.split(/[^a-z]+/).filter((w) => w.length >= 3);
    if (words.every((word) => vocabulary.has(word))) continue;
    return phrase;
  }
  return null;
}

/** What the owner is told about a name Hawlai does not recognise. */
export function unknownNameWarning(phrase: string): string {
  return `This names "${phrase}", which isn't in your catalogue. Saved exactly as you wrote it — but if it's a product you sell, add it so Hawlai can write about it properly, and if it isn't, a page naming something you don't sell is a customer asking for it and nobody able to send it.`;
}

/** What Hawlai is told when IT invented the name. */
export function unknownNameRefusal(phrase: string): string {
  return `I was about to write "${phrase}" onto the page, and there's no such product in your catalogue. I'm not putting a product on your site that you don't sell — add it to the catalogue and I'll write about it, or tell me which of your real products you meant.`;
}
