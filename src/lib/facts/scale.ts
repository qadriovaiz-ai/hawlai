// LAKH AND CRORE ARE MULTIPLIERS, NOT UNITS.
//
// FOUND BY THE TIER-2 ADVERSARIAL GATE, 20 October 2026, for Rs 2.82 —
// and it is the single thing the real-estate fixture was built to
// provoke. Five true, recorded prices were being refused:
//
//   "4 BHK penthouse at ₹1.2 Cr, 2100 sq ft."
//   "3 BHK ₹72 lakh — 1340 sq ft."
//   "Flats from ₹45 lakh to ₹1.2 crore."
//   "2 BHK, 950 sq ft. ₹45 lakh."
//   "4 BHK penthouse, 2100 sq ft, private terrace. ₹1.2 crore."
//
// Every one of those figures is in the records — as 12000000, 7200000
// and 4500000. The extractor reports what the sentence says, which is
// 1.2 with a unit of "Cr", and the arithmetic compared 1.2 with
// 12000000 and removed the sentence.
//
// WHY THIS IS NOT A CONVERSION, which matters because this pipeline's
// rule is that a model must never convert a figure. It is not being
// asked to. The MODEL still copies what it was given; this is the
// CHECKER learning that "1.2 crore" and "12000000" are the same number
// written two ways, exactly as it already knows "hours" and "hour" are
// one unit. A fixed multiplier is arithmetic, not judgement.
//
// AND IT IS THE SPELLING EVERY INDIAN BUYER READS. A property listing
// that says 12000000 instead of 1.2 crore is not a listing anybody
// would write. Refusing the natural spelling deletes the true claim and
// leaves the owner with copy nobody can price.

/** Indian scale words, and the plain multipliers they stand for. */
const SCALES: { names: string[]; of: number }[] = [
  { names: ["thousand", "k", "hazaar", "hazar"], of: 1_000 },
  { names: ["lakh", "lac", "lakhs", "lacs", "l"], of: 100_000 },
  { names: ["crore", "cr", "crores", "karod", "karor"], of: 10_000_000 },
];

/**
 * The multiplier a unit string stands for, or 1.
 *
 * Case-insensitive, and tolerant of the currency travelling with it:
 * the extractor returns "Cr", "crore", "lakh" and sometimes "₹ crore"
 * depending on how the sentence was written.
 */
export function scaleOf(unit: string | null | undefined): number {
  const raw = String(unit ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
  if (!raw) return 1;
  for (const word of raw.split(/\s+/)) {
    const hit = SCALES.find((s) => s.names.includes(word));
    if (hit) return hit.of;
  }
  return 1;
}

/**
 * True when a unit is ONLY a scale word, so the money unit is implied.
 *
 * "₹72 lakh" has unit "lakh", which says nothing about currency — and
 * sameUnit must not then refuse it for disagreeing with the record's
 * "inr". A scale word is a size, not a kind.
 */
export function isScaleOnly(unit: string | null | undefined): boolean {
  const raw = String(unit ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
  if (!raw) return false;
  const words = raw.split(/\s+/);
  return words.length > 0 && words.every((w) => SCALES.some((s) => s.names.includes(w)));
}

/**
 * A figure with its scale applied.
 *
 * NEVER APPLIED TWICE, and that is the one thing to be careful about: a
 * record whose value is already 12000000 must not be multiplied because
 * its unit happens to say "inr". Only a scale word multiplies, and only
 * on the side that carries one.
 */
export function atScale(value: number, unit: string | null | undefined): number {
  return value * scaleOf(unit);
}
