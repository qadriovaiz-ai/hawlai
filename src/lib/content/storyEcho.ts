// Did the piece actually use the owner's own story? (2026-09-20)
//
// THE FAILURE: "Candle Making Workshop ke liye ek chhota, punchy caption"
// came back as "Wax pighlaao, fragrance chunno, apne haathon se banao. 90
// minutes. Ek candle jo tumhari apni hai. ₹800 — link in bio." Every word
// true, nothing invented, and any candle workshop in India could have
// published it. Asked for a SHORT piece, the writer trimmed the part that
// costs the most words: the owner's story. Brevity and specificity were
// treated as competing, when the piece should compress the detail instead
// of dropping it.
//
// This is the check that notices, in code rather than by asking a model
// for an opinion: does the draft echo anything distinctive from the
// owner's story facts?
//
// ONLY the story counts. The price (₹800) and the duration (90 minutes)
// come from the catalogue — every competitor has those too, and counting
// them would have passed the very caption that started this. So words the
// catalogue, the business name or the category already contain are struck
// out of the story's vocabulary before anything is compared.
//
// ONE WORD IS NOT AN ECHO (2026-09-20, second report). The first version
// passed anything that shared a single word with the story, and "Khud
// banao. Khud le jaao. Soy wax, apni pasand ki fragrance, 90 minutes… ek
// candle jo tumne apne haathon se dhaali hai" passed on "sirf", "khud",
// "haathon" — and on "work", which came from the TITLE of a story answer
// ("How we work"), a label Hawlai wrote, not the owner. So:
//   - titles are ignored; only what the owner actually typed counts;
//   - a match is STRONG (a number like the 24-hour cure, or a name like
//     Kanpur) or ORDINARY (any other distinctive word);
//   - the piece has used the story when it carries one strong match, or
//     two ordinary ones. A single ordinary word is the kind of overlap a
//     generic sentence has by accident.

import { STORY_CATEGORY } from "@/lib/business/businessStory";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { looksHinglish, normaliseLanguage, type CopyLanguage } from "@/lib/content/language";

/** Words too common to make anything distinctive — English and the Hinglish a caption is written in. */
const COMMON = new Set([
  "with", "that", "this", "from", "your", "you", "our", "the", "and", "for", "but", "not", "are", "was", "were", "have", "has", "had", "can", "will", "just", "only", "also", "when", "what", "which", "each", "every", "some", "made", "make", "makes", "making", "like", "into", "than", "then", "they", "them", "their", "there", "here", "about", "after", "before", "because", "would", "could", "should", "more", "most", "very", "much", "many", "been", "being", "does", "done", "over", "under", "same", "other", "such", "these", "those",
  "hai", "hain", "tha", "thi", "the", "kar", "karo", "karta", "karti", "karte", "karna", "kiya", "kiye", "liye", "mein", "main", "aur", "par", "phir", "bhi", "koi", "kuch", "jab", "tab", "abhi", "apna", "apni", "apne", "hum", "humne", "hamara", "mera", "meri", "mere", "tumhara", "tumhari", "yeh", "woh", "kya", "kyun", "nahi", "haan", "sab", "bahut", "thoda", "zyada", "achha", "accha", "banao", "banaya", "banate",
  // What the second slip-through was built from: the words any handmade
  // business says about itself.
  "sirf", "khud", "haath", "haathon", "haatho", "har", "sath", "saath", "pasand", "chahiye", "milta", "milti", "hota", "hoti", "hote", "rakhte", "rakhta", "dete", "deta", "lete", "leta", "jaao", "jao", "chalo", "dekho", "suno", "work", "works", "working",
]);

function words(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^a-z0-9₹]+/)
    .filter(Boolean);
}

/** Numbers worth matching on their own ("24" hours, "3" generations) — not a price or a year. */
function isTellingNumber(word: string): boolean {
  return /^\d{1,3}$/.test(word);
}

/** How much a matching word is worth: a number or a name, or any other distinctive word. */
export type StoryWords = { strong: Set<string>; ordinary: Set<string> };

/** Names the owner typed mid-sentence (Kanpur, Diwali) — never the word that starts a sentence. */
function namesIn(text: string): string[] {
  const out: string[] = [];
  for (const sentence of String(text ?? "").split(/[.!?\n—]+/)) {
    const tokens = sentence.trim().split(/\s+/).slice(1);
    for (const t of tokens) {
      const word = t.replace(/[^A-Za-z]/g, "");
      if (word.length >= 3 && word[0] === word[0].toUpperCase() && word.slice(1) !== word.slice(1).toUpperCase()) out.push(word.toLowerCase());
    }
  }
  return out;
}

/**
 * The words that belong to THIS owner's story and nowhere else in the
 * facts — what a piece has to echo for the story to have been used.
 *
 * Only the CONTENT of each answer: the title is the question Hawlai
 * asked ("How we work"), and matching on it passed a caption that shared
 * nothing but the word "work".
 */
export function storyVocabulary(facts: BusinessFacts | null | undefined): StoryWords {
  const empty: StoryWords = { strong: new Set(), ordinary: new Set() };
  const story = (facts?.ownerFacts ?? []).filter((k) => k.category === STORY_CATEGORY);
  if (!story.length) return empty;

  // Everything a competitor in the same line of work would also have.
  const shared = new Set<string>();
  const addShared = (text: unknown) => {
    for (const w of words(String(text ?? ""))) shared.add(w);
  };
  addShared(facts?.businessName);
  addShared(facts?.category);
  addShared(facts?.city);
  for (const p of facts?.products ?? []) {
    addShared(p.name);
    addShared(p.description);
    addShared(p.category);
  }
  for (const o of facts?.offers ?? []) addShared(o.label);
  for (const k of facts?.ownerFacts ?? []) if (k.category !== STORY_CATEGORY) addShared(k.content);

  const out: StoryWords = { strong: new Set(), ordinary: new Set() };
  for (const k of story) {
    const names = new Set(namesIn(k.content));
    for (const w of words(k.content)) {
      if (COMMON.has(w) || shared.has(w)) continue;
      if (isTellingNumber(w)) {
        out.strong.add(w);
        continue;
      }
      if (w.length < 4 || /^\d+$/.test(w)) continue;
      if (names.has(w)) out.strong.add(w);
      else out.ordinary.add(w);
    }
  }
  return out;
}

/** A strong match is enough on its own; ordinary words need each other. */
export const ORDINARY_MATCHES_NEEDED = 2;

/**
 * How many ordinary words a piece must share with the story.
 *
 * Two, normally. But a piece written in English from notes kept in
 * Hinglish can only carry the detail across by translating it — the words
 * themselves don't survive, so demanding two of them would call every
 * honest English caption generic. There, one is the evidence there is.
 */
export function ordinaryMatchesNeeded(facts: BusinessFacts | null | undefined, language?: CopyLanguage | string | null): number {
  if (!language) return ORDINARY_MATCHES_NEEDED;
  const asked = normaliseLanguage(language);
  const story = (facts?.ownerFacts ?? []).filter((k) => k.category === STORY_CATEGORY).map((k) => k.content).join(" ");
  const storyIsHinglish = looksHinglish(story);
  const sameRegister = asked === "hinglish" ? storyIsHinglish : !storyIsHinglish;
  return sameRegister ? ORDINARY_MATCHES_NEEDED : 1;
}

/** Every word the piece actually says, whatever shape it came back in. */
export function textOfOutput(output: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown, key?: string) => {
    if (key?.startsWith("_")) return;
    if (typeof value === "string") parts.push(value);
    // Arrays are objects too: Object.entries walks their items by index.
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(output);
  return parts.join(" ");
}

/**
 * Whether the piece used the owner's story. True when there's no story to
 * use: a business that hasn't written one can't be failed for missing it.
 */
export function usesOwnStory(output: unknown, facts: BusinessFacts | null | undefined, language?: CopyLanguage | string | null): boolean {
  const vocabulary = storyVocabulary(facts);
  if (vocabulary.strong.size === 0 && vocabulary.ordinary.size === 0) return true;
  const said = new Set(words(textOfOutput(output)));
  for (const w of vocabulary.strong) if (said.has(w)) return true;
  let ordinary = 0;
  for (const w of vocabulary.ordinary) if (said.has(w)) ordinary += 1;
  return ordinary >= ordinaryMatchesNeeded(facts, language);
}

/** The owner's story facts, shortest first — what a retry is told to compress. */
export function storyForRetry(facts: BusinessFacts | null | undefined, limit = 3): string[] {
  return (facts?.ownerFacts ?? [])
    .filter((k) => k.category === STORY_CATEGORY)
    .map((k) => `${k.title}: ${k.content}`)
    .slice(0, limit);
}

export const GENERIC_NOTE =
  "Nothing from your story made it into this one, so it reads like any business in your line of work could have written it. Try again, or add the detail you'd have told a customer yourself.";
