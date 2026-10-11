// How much of this piece is about the reader, and how much about the
// owner.
//
// THE LIVE FAILURE (11 October 2026). "write a facebook post about the
// lavender candle" came back as a 224-word first-person story — "I
// learned this the hard way", "that batch never left the house", "I
// light one myself most nights" — with the price and shipping as one
// line at the very end.
//
// Nothing was broken. The 2026-10-09 inversion changed the GATE and left
// the INSTRUCTION: craftSection still said "the owner's own story is in
// the facts above: use it. That detail is the whole point of the piece."
// The model did as it was told.
//
// And neither existing guard objected, correctly:
//   - isGeneric passes anything carrying a recorded specific, and a
//     story IS one;
//   - narrative provenance passes a story the owner has written down,
//     and this one was written down.
//
// So this is the missing third measure. Provenance asks "is this story
// TRUE". Genericness asks "could anyone have written this". Neither
// asks "is this piece ABOUT the reader", which is what P1 is.
//
// WHAT THIS IS NOT. It does not ban the story. P1 withdrew it as the
// ENGINE, not as material: one story sentence inside an otherwise
// customer-first post is fine, and a piece the owner actually ASKED to
// be their story is correct at any length of it.

import { pieces } from "@/lib/claims/claimCheck";
import { textOfOutput } from "@/lib/content/storyEcho";
// ONE list, shared with narrativeProvenance - see ownerVoice.ts for why.
import { isOwnerVoice } from "@/lib/content/ownerVoice";

/** Sentences in which the owner is the subject. */
export function storySentences(text: string): string[] {
  return pieces(String(text ?? ""))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isOwnerVoice(s));
}

/** How much of the piece is the owner talking about themselves, 0 to 1. */
export function storyShare(text: string): number {
  const all = pieces(String(text ?? "")).map((s) => s.trim()).filter((s) => s.length > 2);
  if (!all.length) return 0;
  return storySentences(text).length / all.length;
}

/**
 * Above this, the piece is ABOUT the business rather than the product.
 *
 * A third, not a half. The live post was five sentences in six, but a
 * post where every second sentence is the owner is already not written
 * for the reader — and the one-story-sentence case that P1 explicitly
 * allows sits comfortably below a third in any piece long enough to
 * have an offer and a next step.
 */
export const STORY_SHARE_LIMIT = 0.34;

/**
 * Word caps, per platform, as NUMBERS.
 *
 * The content type's own instructions said "80-150 words,
 * community-toned" and the live post was 224. A range inside a sentence
 * of prose is a suggestion; this is the thing a check can read.
 *
 * Only the types with a real platform limit are here. A type absent from
 * this table has no cap, which is different from a cap of zero.
 */
export const WORD_CAPS: Record<string, number> = {
  instagram_post: 150,
  facebook_post: 150,
  threads_post: 100,
  twitter_post: 60,
  linkedin_post: 250,
  pinterest_pin: 80,
  reel_idea: 120,
};

export function wordCount(text: string): number {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/** Over the platform's cap, or null when there is no cap or it is inside it. */
export function overWordCap(text: string, contentType: string): { words: number; cap: number } | null {
  const cap = WORD_CAPS[contentType];
  if (!cap) return null;
  const words = wordCount(text);
  return words > cap ? { words, cap } : null;
}

/**
 * Did the owner ask for the story?
 *
 * Read from what they typed, because that is the only honest signal. A
 * request for the business's story is a different request, and the whole
 * piece being the story is then right.
 */
export function askedForStory(topic: string): boolean {
  const t = String(topic ?? "").toLowerCase();
  return /\b(our|my|the)\s+(story|journey|beginning)\b/.test(t)
    || /\babout\s+(us|me|the\s+(founder|owner|business))\b/.test(t)
    || /\bhow\s+(we|i|it)\s+(started|began|all\s+started)\b/.test(t)
    || /\bbehind\s+the\s+(scenes|brand)\b/.test(t)
    || /\b(founder|owner)['’]?s?\s+(story|note)\b/.test(t)
    || /\b(hamari|meri)\s+(kahani|shuruaat)\b/.test(t);
}

export type CustomerFirstProblem =
  | { kind: "story_dominant"; share: number; sentences: string[] }
  | { kind: "too_long"; words: number; cap: number };

/**
 * What is wrong with this piece's shape, if anything.
 *
 * Length first, because it is the cheaper fix and a piece can be both:
 * telling the model one thing at a time is what makes the retry land.
 */
export function customerFirstProblem(
  output: unknown,
  contentType: string,
  topic: string
): CustomerFirstProblem | null {
  const text = textOfOutput(output);
  if (!text.trim()) return null;

  const long = overWordCap(text, contentType);
  if (long) return { kind: "too_long", ...long };

  // A piece the owner asked to be their story is allowed to be it.
  if (askedForStory(topic)) return null;

  const share = storyShare(text);
  if (share > STORY_SHARE_LIMIT) {
    return { kind: "story_dominant", share, sentences: storySentences(text) };
  }
  return null;
}

/**
 * What the owner reads, in a sentence that works.
 *
 * The previous note read "I've left in but can't back up something you
 * do yourselves — nothing in your records says it", which is not a
 * sentence. This one says what the piece is, what it should have been,
 * and how to get the other thing on purpose.
 */
export function customerFirstNote(problem: CustomerFirstProblem, cut = 0): string {
  if (problem.kind === "too_long") {
    // TWO DIFFERENT REASONS A PIECE IS STILL LONG, and saying the wrong
    // one is worse than saying nothing. Before `cut` existed this note
    // claimed "it is one long sentence" even when sentences HAD been
    // cut and the price line was what kept it over - which reads as the
    // tightening having failed rather than having made a choice.
    if (cut > 0) {
      return `That came out at ${problem.words} words against ${problem.cap} for this post. I cut ${cut === 1 ? "a sentence" : `${cut} sentences`} of description and it is still over, because I will not cut the line with the price or the link. Tell me which part to lose instead.`;
    }
    return `That came out at ${problem.words} words and this post works best under ${problem.cap}. It is one long sentence, so I have not cut it — tell me how to shorten it and I will.`;
  }
  return `Most of that is your own story rather than the product and the reader. I've left it as it is, but a post like this usually lands better leading with what the customer wants. Ask me for "our story" when you want a piece that IS the story.`;
}

/** The instruction for the one retry. */
export function customerFirstBrief(problem: CustomerFirstProblem): string {
  if (problem.kind === "too_long") {
    return `- This came out at ${problem.words} words. Cut it to under ${problem.cap}, keeping the product fact, the price and the next step. Cut description first, never the facts.`;
  }
  return [
    `- This is mostly about the owner. Rewrite it so it is about the reader: the customer's situation first, then what the product does for it, then the price or offer, then one clear next step.`,
    `- Keep AT MOST ONE short sentence of the owner's own story, and only if it earns its place as proof. These are the sentences to cut or compress:`,
    ...problem.sentences.slice(0, 3).map((s) => `    "${s}"`),
    `- Invent nothing. Use only the facts already given.`,
  ].join("\n");
}

/**
 * The field the prose actually lives in.
 *
 * Trimming has to happen on ONE field, not on the joined blob
 * textOfOutput produces: hashtags, a heading and a note are separate
 * keys, and cutting across them would mangle the shape the card reads.
 */
function proseKey(output: any): string | null {
  if (!output || typeof output !== "object") return null;
  for (const k of ["text", "body", "caption", "content"]) {
    if (typeof output[k] === "string" && output[k].trim()) return k;
  }
  let best: string | null = null;
  for (const [k, v] of Object.entries(output)) {
    if (k.startsWith("_") || typeof v !== "string") continue;
    if (!best || (v as string).length > String(output[best]).length) best = k;
  }
  return best;
}

/**
 * A sentence that must survive the cut: it carries the price or the link.
 *
 * WHY (11 October 2026, Ovaiz). Tightening kept the opening and the
 * close and dropped from the middle, which is right for description and
 * wrong for the two things the post exists to carry. A post trimmed to
 * fit that no longer says what it costs or where to buy it has been
 * made worse, not shorter.
 *
 * So these are kept EVEN WHEN KEEPING THEM LEAVES THE PIECE OVER THE
 * CAP. A post 10 words long that still has the price beats one that
 * fits and does not. When that happens the owner is told, rather than
 * the piece quietly exceeding the limit.
 *
 * A bare three-digit number counts, because that is how prices are
 * written in this copy - "Lavender candle, 550." A two-digit one does
 * not, because "40 hour burn" and "24 ghante" are specifications.
 */
const CARRIES_THE_OFFER = [
  // Price, with or without a symbol.
  /(?:₹|\brs\.?\s?|\binr\s?)\s?\d/i,
  /\b\d[\d,]{2,}\b/,
  /\b\d{1,3}\s*%\s*off\b/i,
  /\b(?:rupees|rupaye|priced|costs?)\b/i,
  // The link, in every form it reaches a caption.
  /https?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9][a-z0-9-]*\.(?:com|in|co\.in|net|org|shop|store|online|io|app)\b/i,
  /\blink\s+in\s+(?:bio|the\s+bio)\b/i,
  // "Order on the store page" is the next step even with no URL in it.
  /\b(?:order|buy|shop|book)\s+(?:it\s+)?(?:on|at|from|here)\b/i,
];

export function carriesTheOffer(sentence: string): boolean {
  const s = String(sentence ?? "");
  return CARRIES_THE_OFFER.some((re) => re.test(s));
}

export type Tightened = { text: string; dropped: number; keptForFacts: number };

/**
 * Cut whole sentences until the piece fits, keeping the opening and the
 * close.
 *
 * WHY THIS EXISTS (11 October 2026). A 189-word Facebook post went out
 * on a card with a cap of 150. The retry HAD run - three model calls -
 * and come back still long, and then the code kept it and apologised:
 * "I've left it as it is so you can see it." That was my choice and it
 * was the wrong one. Showing an owner a post that does not fit, with a
 * note suggesting they ask again, is work handed back.
 *
 * NEVER MID-SENTENCE. A truncated sentence reads as a bug and can
 * change what the copy says. Whole sentences only.
 *
 * THE LAST SENTENCE IS KEPT, because that is where the next step is -
 * the price, the link, the "order on the store page". Dropping from the
 * middle loses description, which is what should go first.
 */
export function tightenToCap(text: string, cap: number): Tightened {
  const original = String(text ?? "");
  if (wordCount(original) <= cap) return { text: original, dropped: 0, keptForFacts: 0 };

  const sentences = pieces(original).filter((s) => s.trim());
  // One sentence over the cap cannot be trimmed without cutting inside
  // it, so it is left alone and the note says so. Rare, and better than
  // a half sentence.
  if (sentences.length < 3) return { text: original, dropped: 0, keptForFacts: 0 };

  const lastIndex = sentences.length - 1;
  const keep = new Set<number>([0, lastIndex]);
  let words = wordCount(sentences[0]) + wordCount(sentences[lastIndex]);

  // PASS ONE: the price and the link, whatever it costs in words.
  let keptForFacts = 0;
  for (let i = 1; i < lastIndex; i += 1) {
    if (!carriesTheOffer(sentences[i])) continue;
    keep.add(i);
    words += wordCount(sentences[i]);
    keptForFacts += 1;
  }
  // PASS TWO: description, in the order it was written, while it fits.
  for (let i = 1; i < lastIndex; i += 1) {
    if (keep.has(i)) continue;
    const n = wordCount(sentences[i]);
    if (words + n > cap) continue;
    keep.add(i);
    words += n;
  }

  const out = sentences
    .filter((_, i) => keep.has(i))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: out, dropped: sentences.length - keep.size, keptForFacts };
}

/** Tighten the prose field in place, leaving every other key alone. */
export function tightenOutput(
  output: any,
  contentType: string
): { output: any; dropped: number; keptForFacts: number } {
  const cap = WORD_CAPS[contentType];
  const key = proseKey(output);
  if (!cap || !key) return { output, dropped: 0, keptForFacts: 0 };
  const r = tightenToCap(output[key], cap);
  if (!r.dropped) return { output, dropped: 0, keptForFacts: 0 };
  return { output: { ...output, [key]: r.text }, dropped: r.dropped, keptForFacts: r.keptForFacts };
}
