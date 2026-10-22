// WORDS THAT ARE NEVER A NAME, in either language this product writes.
//
// ONE list, shared, because two checks now need it and a second copy
// would drift: the withheld-subject check reduces a product name to its
// content words, and the introduced-name check must not report a
// capitalised determiner as an invented name.
//
// THE COST OF NOT HAVING IT, measured free on 2026-10-22: turning the
// name check on for label fields - which is what makes a title
// checkable at all - flagged "ek" in the title "Keratin Treatment — Ek
// Session, Smooth Finish". "Smooth" and "Finish" are the unlicensed
// benefit claim the founder found; "Ek" is the Hinglish word for "one"
// and deleting that title for it would be B9 again, the guard removing
// true copy.
//
// NOTHING TRADE-SPECIFIC GOES IN HERE. These are grammar words, not
// business, product or industry vocabulary - multiTenantVocabulary.ts
// stays green and this list must never become a way around it.

export const FUNCTION_WORDS = new Set([
  // English
  "a", "an", "the", "and", "or", "but", "for", "with", "our", "your", "their", "this", "that", "these", "those",
  "from", "in", "on", "at", "to", "of", "by", "is", "are", "was", "be", "it", "we", "you", "us", "my", "one", "two",
  "all", "any", "every", "just", "now", "here", "there", "get", "got",
  // Hinglish, in the spellings this product actually receives
  "ek", "aur", "ya", "ke", "ka", "ki", "ko", "se", "mein", "me", "hai", "hain", "tha", "thi", "bhi", "par", "pe",
  "wala", "wali", "wale", "yeh", "woh", "kya", "sab", "abhi", "yahan", "lagta", "lagte", "hota", "hoti",
]);
