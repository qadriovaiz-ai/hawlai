// Who wrote one line on a page — per LINE, not per block.
//
// THE BUG THIS FIXES (found 3 Oct 2026). The "Claims on your site"
// review listed items from Home, Contact, Privacy and Terms and nothing
// from About, while About was live and saying "burns slower, cleaner,
// and safer than mass-market paraffin".
//
// `_source` was one mark for a whole block. The builder sets it to
// "edited" when the owner changes any text prop, and both readers treat
// the block as the owner's from then on: the review skips it, and
// ownerWritten() keeps it as EVIDENCE. So editing a heading exempted the
// paragraph underneath it — a sentence Hawlai wrote became unreviewable
// and, worse, became the proof that the same sentence was true. That is
// the loop Stage 1 broke, reopened by one prop in one block.
//
// A block is not a sentence. Provenance has to be per prop.
//
// Nothing is imported here on purpose: the builder's Properties Panel is
// a client component and writes these marks, while the review and the
// facts reader are server-only and read them. One definition, no bundle.

/** Block props that hold words a visitor reads. The same four everywhere. */
export const TEXT_PROPS = ["text", "heading", "html", "label"] as const;
export type TextProp = (typeof TEXT_PROPS)[number];

/**
 * Whether this prop holds words a visitor reads.
 *
 * THE ONE PLACE THAT ANSWERS IT, and the reason this function exists
 * rather than each caller testing the list itself. On 8 November 2026
 * the same four names were declared SIX times: here, the claims guard's
 * `BLOCK_TEXT_KEYS`, an inline array validating a claims-review request,
 * a Set in the builder's Properties Panel that SHADOWED this very name,
 * an enum in a model-facing tool schema, and a union type repeated three
 * times in the owner's claims review.
 *
 * A seventh copy is not a tidiness problem, it is the 2026-09-30
 * incident waiting to happen again: `faq_item` keeps its question on
 * `heading` and its answer on `html`, and a prop called `answer` would
 * have been invisible to every one of those six — so an AI-written FAQ
 * answer would have reached a live page UNGUARDED. Add a word prop in
 * one place now and every reader learns about it at once.
 *
 * tests/textPropsSingleSource.test.ts fails if a seventh declaration
 * appears.
 */
export function isTextProp(prop: string | null | undefined): boolean {
  return (TEXT_PROPS as readonly string[]).includes(String(prop ?? ""));
}

type Props = Record<string, any>;

/**
 * Whether the owner wrote THIS prop of this block.
 *
 * `_edited` lists the props they typed. A block marked "edited" with no
 * list is from before per-prop marks existed, and is deliberately read
 * as "the owner has been in this block" rather than "the owner wrote
 * every line in it" — which is not the same claim, and treating it as
 * the same is what hid the About page.
 *
 * Reading it strictly can only over-ask: a line wrongly re-flagged costs
 * the owner one decision on the review card, and anything they have
 * already stood behind is in Business Knowledge by then, so it is no
 * longer unsupported and does not come back. A line wrongly exempted
 * goes on the page unchecked and vouches for itself.
 */
export function ownerWroteProp(props: unknown, prop: string): boolean {
  if (!props || typeof props !== "object") return false;
  const p = props as Props;
  if (p._source !== "edited") return false;
  const edited = p._edited;
  if (!Array.isArray(edited)) return false;
  return edited.includes(prop);
}

/** Whether Hawlai wrote this prop — the inverse, for a block with no mark at all. */
export function machineWroteProp(props: unknown, prop: string, pageSource?: string | null): boolean {
  if (!props || typeof props !== "object") return false;
  const p = props as Props;
  if (ownerWroteProp(p, prop)) return false;
  if (p._source === "generated" || p._source === "edited") return true;
  // THE PAGE'S OWN MARK, when the block has none.
  //
  // THE LIVE SUPPRESSION (3 Oct 2026): on candle_by_qaaf the Home and
  // About rows both carry content_source 'generated', while the blocks
  // inside them carry no _source at all — they were written before the
  // per-block marking existed. Reading the block alone made that copy
  // the OWNER's, so the site became its own evidence and every claim on
  // it was "supported": "safer than mass-market paraffin" proved itself.
  //
  // website_pages.content_source is the authority Hawlai actually has
  // for those rows, and it says plainly who wrote the page.
  if (pageSource === "generated") return true;
  // Neither marked: the site predates all of this. Their own words,
  // which they have lived with, and guessing against them would strip
  // copy nobody asked to check.
  return false;
}

/**
 * The props on a block the owner has written, after this change.
 *
 * Merged rather than replaced: editing the heading must not un-attest
 * the paragraph they wrote last week.
 */
export function withOwnerProp(props: unknown, prop: string): Props {
  const p = (props && typeof props === "object" ? props : {}) as Props;
  const existing = Array.isArray(p._edited) ? p._edited.filter((x: unknown) => typeof x === "string") : [];
  return { ...p, _source: "edited", _edited: Array.from(new Set([...existing, prop])) };
}
