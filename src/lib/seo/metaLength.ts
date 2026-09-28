// Keeping a generated meta description inside what Google shows.
//
// The limit is ~155-160 characters, and past it the sentence ends
// mid-word in the search result. Hawlai's own website builder wrote a
// 164-character description for a live homepage and the SEO health check
// failed that page for it — asking the model for "under 160 characters"
// in the schema was not enough, exactly as asking it not to rewrite the
// owner's wording was not enough.
//
// WHERE THIS APPLIES, and where it deliberately does not: this trims copy
// HAWLAI wrote with nobody reviewing it — the builder generates every
// page of a new site in one go. It is never used on wording the owner
// typed, and never on propose_page_meta, where a card shows the count and
// the person decides. A silent edit is acceptable on a machine's own
// first draft and not on someone's sentence.

export const META_DESCRIPTION_LIMIT = 160;

/** The shortest a trimmed description may end up before a hard cut is better than a sentence cut. */
const MIN_AFTER_SENTENCE_CUT = 80;

/**
 * A description that fits, cut at a sentence end where one is available
 * and at a word boundary otherwise.
 */
export function fitMetaDescription(text: string, limit: number = META_DESCRIPTION_LIMIT): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;

  // A description that ends on a full stop reads as finished rather than
  // cut off, so that is the first thing to try.
  const window = clean.slice(0, limit);
  const lastSentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (lastSentence >= MIN_AFTER_SENTENCE_CUT) return clean.slice(0, lastSentence + 1).trim();
  if (/[.!?]$/.test(window.trim()) && window.trim().length >= MIN_AFTER_SENTENCE_CUT) return window.trim();

  // Otherwise cut on a word and say so with an ellipsis, leaving room
  // for it inside the limit.
  const room = clean.slice(0, limit - 1);
  const lastSpace = room.lastIndexOf(" ");
  return `${(lastSpace > 0 ? room.slice(0, lastSpace) : room).replace(/[,;:\s]+$/, "")}…`;
}
