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
  // TOLERANT, NOT EXACT, and the same reasoning as the figure check of
  // 18 October: slug equality refused a true price because the sentence
  // said "ghee" and the catalogue said "Desi ghee 500ml".
  //
  // CAUGHT ON 2026-10-20 WHILE FIXING THE HAND-CHURNING LEAK. Moving
  // the scope filter in front of the judge made this strictness visible
  // for the first time: a claim about "paneer" was being denied the
  // paneer's OWN description, because the record's slug is
  // "paneer_250g". A filter that drops the right record is worse than
  // no filter - it deletes a true claim instead of a false one.
  //
  // sameProductName asks whether one name's content words are all
  // present in the other's, so "paneer" matches "paneer 250g" and
  // "Rose candle" still does not match "lavender candle".
  if (scope.kind === "product") return sameProductName(wanted, scope.product);
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
  // A NAME THAT IS ONLY DETERMINERS NAMES NOTHING. "the one", "ours" —
  // it is the range, not an item, and refusing it as an unknown product
  // would be refusing the business's own general claim.
  if (!contentWords(named).length) return { kind: "none" };

  const slugs = catalogue.map((p) => productSlug(p?.name)).filter(Boolean);
  const hits = slugs.filter((slug) => sameProductName(named, slug));

  // A COLLECTIVE REFERENCE IS THE RANGE, NOT AN ITEM.
  //
  // Founder's decision, 19 October 2026, after my scope fix refused
  // eight true recorded claims: "the candles do not contain paraffin",
  // "the candle is hand-poured", "the candles contain only soy wax" —
  // all exactly what material.paraffin and process.hand_poured record.
  //
  // DERIVED FROM THE CATALOGUE RATHER THAN FROM A WORD LIST, because a
  // list of collective nouns would be one trade's vocabulary shipped to
  // every business — the thing multiTenantVocabulary exists to stop. If
  // a reference matches MORE THAN ONE product, it cannot be naming one
  // of them, so it is the range and a business-level record is the right
  // evidence for it.
  if (hits.length > 1) return { kind: "none" };

  // AND WITH ONE PRODUCT THERE IS NOTHING TO BE AMBIGUOUS ABOUT. The
  // rule exists because a business sells several things and a
  // business-level record cannot say which; a single-product catalogue
  // has no such gap, so scope never blocks there.
  if (hits.length === 1 && slugs.length === 1) return { kind: "none" };

  if (hits.length === 1) return { kind: "known", slug: hits[0] };
  return { kind: "unknown", named };
}

/**
 * Do these two names refer to the same catalogue item?
 *
 * TOLERANT ON PURPOSE, and a clear bug without it. The exit run of 18
 * October refused "a 500 ml jar of ghee is priced at Rs 850" — a true
 * price — because the sentence says "ghee" and the catalogue says
 * "Desi ghee 500ml", and the comparison demanded slug equality.
 *
 * One name matches the other when its words are all present in the
 * other's. A trailing "s" is dropped per word so "candles" reaches
 * "candle"; nothing else is stemmed, because guessing at morphology in
 * a mix of English and romanised Hindi would match more than it should.
 */
export function sameProductName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = contentWords(a);
  const right = contentWords(b);
  if (!left.length || !right.length) return false;
  const covers = (small: string[], big: string[]) => small.every((w) => big.includes(w));
  return covers(left, right) || covers(right, left);
}

/**
 * Determiners and quantifiers, in both languages.
 *
 * NOT A PRODUCT VOCABULARY, which is why a list is safe here: these are
 * function words, the same in every trade. "the candles" failed to match
 * "Lavender candle" without this, because "the" counted as a word the
 * other name had to contain — and "the candles" is exactly the
 * collective reference the rule has to recognise.
 */
const DETERMINERS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "our", "your", "their", "my", "its",
  "each", "every", "all", "both", "any", "some", "one", "of", "jar", "pack", "box",
  // Pronouns, because a reference can be made entirely of them: "each
  // of them", "all of it". A surviving mutation found "them" missing.
  "them", "they", "it", "us", "we", "you", "ones",
  "ek", "yeh", "woh", "hamari", "hamara", "hamare", "aapka", "aapki", "sab", "sabhi", "har",
]);

/** A name's words, with determiners dropped and a trailing "s" trimmed. */
export function contentWords(s: string | null | undefined): string[] {
  // "500 ml" and "500ml" are one word. Done HERE and not in
  // productSlug, which mints the record keys: gluing there would
  // silently rename `product.desi_ghee_500_ml` and break every citation
  // already written against it.
  const glued = String(s ?? "").replace(/(\d)\s+([a-zA-Z])/g, "$1$2");
  return productSlug(glued)
    .split("_")
    .map((w) => w.replace(/s$/, ""))
    .filter((w) => w.length > 1 && !DETERMINERS.has(w));
}

/**
 * How a record's scope reads to the OWNER, in a refusal.
 *
 * Phrased as a limit, because that is what it is when the validator is
 * explaining why a claim about one named item was not allowed.
 */
export function describeScope(key: string): string {
  const scope = scopeOfKey(key);
  if (scope.kind === "policy") return "a store-wide policy — it applies to every product";
  if (scope.kind === "product") return `about one product only: ${scope.product.replace(/_/g, " ")}`;
  return "about the business generally, NOT about any one product";
}

/**
 * How a record's scope reads to the JUDGE — as COVERAGE, not as a limit.
 *
 * THE WORDS I GAVE THE JUDGE WERE TELLING IT TO REFUSE. It was shown
 * "about the business generally, NOT about any one product" beside a
 * claim the validator had already approved, and did the obvious thing:
 * refused "the candles do not contain paraffin" three runs in a row for
 * naming "the candles".
 *
 * Scope is decided in code before the judge ever sees the claim
 * (resolveProduct, validateSelection). By the time a fact reaches here
 * it is CLEARED for this claim, so what the judge needs to know is what
 * the fact covers — not what it excludes.
 */
export function describeCoverage(key: string): string {
  const scope = scopeOfKey(key);
  if (scope.kind === "policy") return "a store-wide policy, so it covers every product";
  if (scope.kind === "product") return `recorded against ${scope.product.replace(/_/g, " ")}`;
  return "recorded about the business, so it covers what the business makes in general";
}
