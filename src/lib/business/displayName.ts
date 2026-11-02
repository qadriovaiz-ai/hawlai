// The business's name as a person reads it.
//
// WHY: many owners signed up with a handle ("candle_by_qaaf"), and that's
// what dealerships.dealership_name holds. Email already showed it properly
// ("Candle by Qaaf"), but nothing else did — the SWOT and strategy tools,
// chat, and every generator that reads the business facts wrote the handle
// into customer-facing copy.
//
// One rule, used everywhere a name is shown or written into copy: a handle
// (no spaces, joined with _ or -, all lower case) becomes words; a name the
// owner typed with its own spacing or capitals is kept exactly.

import { isPlaceholderBusinessName } from "@/lib/onboarding/signup";

const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);

export function businessDisplayName(name: string | null | undefined, fallback = "the business"): string {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  // THE SIGNUP STAND-IN IS NOT A NAME — signup Q1. Signup stopped
  // asking for the business name (step 3 collects it) and
  // dealership_name is not null, so a placeholder sits on the record
  // until then. This is the chokepoint businessFacts reads through, so
  // treating it as nothing here keeps it out of every generator at
  // once rather than at 94 call sites.
  if (!clean || isPlaceholderBusinessName(clean)) return fallback;
  const isHandle = !/\s/.test(clean) && /[_-]/.test(clean) && clean === clean.toLowerCase();
  if (!isHandle) return clean;
  return clean
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
