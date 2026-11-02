// THE STAND-IN NAME, AND THE ONE RULE ABOUT IT — signup Q1.
//
// Signup stopped asking for the business name on 2 November: it is
// collected by onboarding step 3, which shows the owner what the
// analysis worked out and lets him correct it. But
// `dealerships.dealership_name` is `not null` (001_schema.sql:15), so
// the row created at signup needs a value.
//
// WHY THIS IS NOT JUST A VALUE. dealership_name is read in 94 files,
// 224 times, and some of those reach a CUSTOMER — the sender name on
// an email, the business name written into marketing copy. A
// placeholder that escapes into either of those is the product
// stating something nobody said, which is what src/lib/claims exists
// to stop.
//
// SO THE RULE IS: the placeholder may be visible inside the dashboard
// for the few minutes before step 3, and it may NEVER leave the
// product. Three places enforce it, each the single chokepoint for its
// path:
//
//   businessDisplayName()   every generator, through businessFacts
//   sendDealerEmail()       the sender name a customer sees
//   sendApprovedEmail()     the name written into marketing copy
//
// AND IT IS DELIBERATELY THE SAME WORDS AS THE EXISTING "no name"
// FALLBACKS. The growth report already says "Your business" when it
// cannot read the record (dailyGrowth.ts businessName). Choosing the
// same string means a leak reads as a blank rather than as a wrong
// name — the founder's call, and the right one.

/**
 * What signup writes until step 3 replaces it.
 *
 * ONE CONSTANT. Two spellings of a placeholder is two things to find
 * later, and the guards below compare against this.
 */
export const PLACEHOLDER_BUSINESS_NAME = "Your business";

/**
 * Is this the stand-in rather than a name the owner gave?
 *
 * CASE- AND SPACE-INSENSITIVE, because the owner can edit this field
 * on step 3 and "your business " typed back in is still not a name.
 * An empty value is not the placeholder — it is nothing, which callers
 * already handle.
 */
export function isPlaceholderBusinessName(name: string | null | undefined): boolean {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return clean === PLACEHOLDER_BUSINESS_NAME.toLowerCase();
}

/**
 * The name, or null when nobody has given one.
 *
 * NULL RATHER THAN A FALLBACK OF ITS OWN, so each caller picks the
 * word its own context needs — "Hawlai" on an envelope, "" in copy,
 * "the business" in a prompt. A shared default here would have put one
 * of those in all three places.
 */
export function realBusinessName(name: string | null | undefined): string | null {
  const clean = String(name ?? "").trim();
  if (!clean || isPlaceholderBusinessName(clean)) return null;
  return clean;
}
