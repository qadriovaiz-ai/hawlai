// WHAT A RECORD IS ABOUT, AND WHAT IT CAN THEREFORE SUPPORT.
//
// The founder's scope rule, 16 October 2026: a claim about one named
// product or service must be cited to a record about THAT product or
// service — a business-level statement does not support it, however
// true the statement is.
//
// WHY THIS IS A MODULE AND NOT THREE PROMPT LINES. It was three prompt
// lines, and on 18 October the founder named the real problem: the rule
// was written into the Select prompt, the judge's rubric and the
// grading sheet, and NOWHERE IN CODE. So it held wherever a model
// happened to apply it and failed wherever one did not. Two consequences
// found in the same run:
//
//   "Shipping for the Lavender Candle is free" was REFUSED, though
//   shipping is free on everything — the rule over-fired on a
//   store-level policy, which by definition covers every product.
//
//   The figure check matched a number against ANY approved claim, so
//   the Rose candle could be given the Lavender's price. Nothing in
//   code knew which product a figure belonged to.
//
// A rule that lives only in prose is a rule that applies unevenly. This
// is the one place scope is decided, and both the validator and the
// verifier read it.

/** What a record's key says it is about. */
export type RecordScope =
  /** One named item: `product.lavender_candle.price`. */
  | { kind: "product"; product: string }
  /**
   * A STORE-LEVEL POLICY — shipping, discount codes.
   *
   * These support a claim about any product, and that is not a
   * loophole: a policy IS about all of them. There is no per-product
   * shipping record and there never will be, so under the scope rule
   * without this carve-out "free shipping on the lavender candle" could
   * never be said at all — a true sentence the baseline graded T twice.
   */
  | { kind: "policy" }
  /**
   * The business generally: materials, processes, counts, the owner's
   * own sentences.
   *
   * These do NOT support a claim about one named item. "We do not use
   * ammonia-based products" is the practice; whether THIS treatment
   * contains ammonia is a different fact, and only a record about the
   * treatment settles it.
   */
  | { kind: "business" };

/** Keys that are store-level policy. Matched on the key's own prefix. */
const POLICY_PREFIXES = ["shipping.", "offer."];

export function scopeOfKey(key: string): RecordScope {
  const k = String(key ?? "").trim();
  if (POLICY_PREFIXES.some((p) => k.startsWith(p))) return { kind: "policy" };
  // product.<slug>.<field> — three parts at least, and the slug is the
  // product. `product.burn_hours` has two parts and is NOT a product
  // record: it is the owner's business-level reading of a row, which is
  // exactly the distinction this rule turns on.
  const parts = k.split(".");
  if (parts[0] === "product" && parts.length >= 3) return { kind: "product", product: parts[1] };
  return { kind: "business" };
}

/** A key-safe form of a product name, the same one getContext mints. */
export function productSlug(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Can a record support a claim about this product?
 *
 * `aboutProduct` is the product the CLAIM names, or null when the claim
 * is about the business. The asymmetry is deliberate:
 *
 *   claim about one item   needs that item's own record, or a policy
 *   claim about the business  any record will do — a business-level
 *                             statement is exactly the right evidence
 *                             for a business-level claim
 */
export function recordSupportsScope(recordKey: string, aboutProduct: string | null | undefined): boolean {
  const scope = scopeOfKey(recordKey);
  const wanted = productSlug(aboutProduct);
  if (!wanted) return true;
  if (scope.kind === "policy") return true;
  if (scope.kind === "product") return scope.product === wanted;
  return false;
}

/**
 * Which product a claim is about, matched against the business's own
 * catalogue rather than taken on trust.
 *
 * A MODEL-SUPPLIED NAME IS NOT A PRODUCT. If `aboutProduct` names
 * something the catalogue does not sell, the claim is about an item
 * that does not exist, and resolving it to null would quietly turn it
 * into a business-level claim that any record could support. So it
 * comes back as `unknown` and the caller refuses it.
 */
export function resolveProduct(
  aboutProduct: string | null | undefined,
  catalogue: { name?: string | null }[]
): { kind: "none" } | { kind: "known"; slug: string } | { kind: "unknown"; named: string } {
  const named = String(aboutProduct ?? "").trim();
  if (!named) return { kind: "none" };
  const wanted = productSlug(named);
  for (const p of catalogue) {
    const slug = productSlug(p?.name);
    if (!slug) continue;
    if (slug === wanted) return { kind: "known", slug };
  }
  return { kind: "unknown", named };
}

/** How a record's scope reads to a human, for the judge and the owner. */
export function describeScope(key: string): string {
  const scope = scopeOfKey(key);
  if (scope.kind === "policy") return "a store-wide policy — it applies to every product";
  if (scope.kind === "product") return `about one product only: ${scope.product.replace(/_/g, " ")}`;
  return "about the business generally, NOT about any one product";
}
