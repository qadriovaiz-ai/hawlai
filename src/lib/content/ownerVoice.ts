// The sentence shapes in which the owner is the subject.
//
// ONE LIST, AND THAT IS THE POINT. Two guards ask different questions
// about the same shapes:
//
//   narrativeProvenance  "is this story on the record?"
//   customerFirst        "is this piece about the owner or the reader?"
//
// On 11 October 2026 they had SEPARATE lists, and the lists disagreed.
// A 224-word founder story went out, and when it was taken apart:
//
//   "I learned this the hard way."            provenance MISSED it
//   "That batch never left the house."        provenance MISSED it
//   "I will not rush the 24-hour setting."    provenance MISSED it
//   "I light one myself most nights."         provenance caught it
//
// customerFirst caught all four, because it was written a day later
// with the real sentences in front of me. Two lists that drift apart
// are worse than one imperfect list: the narrower one silently decides
// what the stricter one never sees.
//
// This module has NO imports on purpose. claimCheck imports
// narrativeProvenance, so anything narrativeProvenance imports must not
// import claimCheck back - and customerFirst does, for `pieces`.

/**
 * First-person sentences about the business or the people in it.
 *
 * Each needs a MARKER - a past-tense decision, a habit adverb, a
 * possessive about the owner's own life - because "we" plus anything is
 * the commonest shape in honest copy. Without markers these would flag
 * "we ship within two days", which is a service fact and nobody's story.
 */
export const OWNER_VOICE: RegExp[] = [
  // A decision or a realisation the owner is reporting. The live post
  // opened with "I learned this the hard way" and provenance had
  // nothing for it.
  /\b(?:i|we)\s+(?:learned|learnt|realised|realized|discovered|decided|started|began|founded|refuse|refused|promised)\b/i,
  // A refusal stated as principle: "I will not rush the 24-hour setting
  // time."
  /\b(?:i|we)\s+(?:will\s+not|won'?t|never|do\s+not|don'?t)\s+\w+/i,
  // Something they do themselves, with or without "myself". The live
  // post's "I light one myself most nights" was caught only by the
  // "myself"; "I light one most nights" was not.
  /\b(?:i|we)\s+\w+(?:\s+\w+){0,3}\s+(?:myself|ourselves|too|as\s+well)\b/i,
  /\b(?:i|we)\s+(?:always|usually|often|still|personally|mostly)\b/i,
  /\b(?:i|we)\s+\w+(?:\s+\w+){0,3}\s+(?:most|every|each)\s+(?:night|day|morning|evening|week|time)s?\b/i,
  // The owner's own life as the setting.
  /\b(?:my|our)\s+(?:first|own|family|mother|father|grandmother|grandfather|kitchen|home|house|bed)\b/i,
  /\bin\s+(?:our|my)\s+own\s+\w+/i,
  // A specific past event referred to as if the reader knows it: "that
  // batch never left the house".
  /\bthat\s+(?:batch|day|order|customer|morning|night)\b/i,
  /\b(?:years?|months?|decades?)\s+ago\b/i,
  /\bthe\s+hard\s+way\b/i,
  /\bit\s+(?:all\s+)?(?:started|began)\b/i,
  // Hinglish and Hindi.
  /\b(?:main|hum|maine|humne)\s+(?:bhi|khud|kabhi|jaldi|pehle)\b/i,
  /\b(?:mera|meri|mere|hamara|hamari)\s+(?:pehla|pehli|apna|apni|ghar|maa|ammi|ghar\s+ka)\b/i,
  /\b(?:saal|mahine|saalon)\s+pehle\b/i,
  /शुरुआत|साल\s+पहले/,
];

/** True when the owner, rather than the reader or the product, is the subject. */
export function isOwnerVoice(sentence: string): boolean {
  const s = String(sentence ?? "");
  return OWNER_VOICE.some((re) => re.test(s));
}
