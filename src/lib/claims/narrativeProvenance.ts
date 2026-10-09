// A backstory nobody told Hawlai.
//
// THE GAP (finding F-N1, audit 8 Oct 2026). Every claim check in this
// directory asks "is this FACT on record" — a price, a count, a rating,
// a material, a guarantee. None of them asks "is this STORY on record".
// So a sentence carrying no checkable fact at all could be wholly
// invented and pass every guard: a founder's history, a customer's
// words, a comparison with an alternative nobody named.
//
// Two sentences that actually went out on 8 October 2026 and that the
// claims guard had nothing to say about:
//
//   "If you're used to synthetic candles that fade in an hour, this is
//    something that performs."
//   "It fills the room slowly rather than hitting you at the door."
//
// Neither names a number, a price or a material. Both assert something
// about an unnamed alternative and about how the product behaves, and
// nothing in the business's records says either.
//
// WHAT THIS CHECKS: a sentence that SOUNDS like it came from the owner —
// their history, a customer quoting them, a comparison with the
// alternatives — has to trace to something the owner actually recorded.
// Not the same question as `usesOwnStory` (src/lib/content/storyEcho.ts),
// which asks whether the piece USED the story and exists to make copy
// specific. This asks the opposite: whether a story in the copy is in
// the record at all. The first is about quality; this one is about truth.
//
// DELIBERATELY PERMISSIVE, in one direction. A sentence is supported by
// ONE distinctive word appearing anywhere in the owner's own writing.
// That lets some invented phrasing through, and it is the right way to
// be wrong here: stripping a TRUE story the owner told is worse than
// missing an invented one, because the invented one still has to get
// past stripUnsupported, which does read the record for every fact in
// it. A guard that deletes the owner's real words would be removed
// within a week, and it would deserve to be.

import { pieces } from "./claimCheck";
import { COMMON } from "@/lib/content/storyEcho";
import type { BusinessFacts } from "./businessFacts";
import type { ClaimsMode } from "./claimCheck";

/** What kind of unrecorded narrative a sentence is carrying. */
export type NarrativeKind = "history" | "attributed" | "comparative";

type Pattern = { kind: NarrativeKind; re: RegExp; why: string };

// WHY THE PATTERNS ARE WRITTEN AS SHAPES, NOT PHRASES. The live misses
// above were not on any phrase list and never would have been — the
// model does not reuse wording, it reuses the MOVE. "If you're used to
// X, this is Y" is the move; the words inside it change every time.
//
// Hinglish and Hindi are here because Hawlai's default register is
// Hinglish (src/lib/content/language.ts). A pattern list in English only
// would be a guard that works on the copy this product writes least.
const PATTERNS: Pattern[] = [
  // The founder's own history.
  {
    kind: "history",
    re: /\b(?:we|i)\s+(?:started|began|founded|launched|set\s+up|opened)\b/i,
    why: "a founding story",
  },
  { kind: "history", re: /\bit\s+(?:all\s+)?(?:started|began)\b/i, why: "a founding story" },
  { kind: "history", re: /\b(?:years?|months?|decades?)\s+ago\b/i, why: "something that happened in the past" },
  { kind: "history", re: /\bback\s+in\s+(?:19|20)\d{2}\b/i, why: "a year in the business's history" },
  { kind: "history", re: /\bwhen\s+(?:we|i)\s+(?:first|started|began)\b/i, why: "a founding story" },
  { kind: "history", re: /\b(?:ever\s+)?since\s+(?:we|i)\s+\w+/i, why: "something that happened in the past" },
  // Hinglish / Hindi.
  // The gap between the pronoun and the verb is bounded, not one word:
  // "Humne ye kaam ek chhoti si dukaan se shuru kiya" puts six words
  // between them, and the first version of this pattern allowed one.
  { kind: "history", re: /\b(?:humne|hum\s+ne|maine|main\s+ne)\b(?:\s+\S+){0,8}\s+shuru/i, why: "a founding story" },
  { kind: "history", re: /\bshuruaat\b/i, why: "a founding story" },
  { kind: "history", re: /\b(?:saal|mahine|saalon)\s+pehle\b/i, why: "something that happened in the past" },
  { kind: "history", re: /शुरुआत|साल\s+पहले/, why: "a founding story" },

  // Someone else's words, put in their mouth.
  {
    kind: "attributed",
    re: /\b(?:a|one|our|my)\s+(?:customer|client|buyer|guest)s?\s+(?:told|said|asked|wrote|says?|tells?|keeps?)\b/i,
    why: "something a customer is said to have told you",
  },
  {
    kind: "attributed",
    re: /\b(?:customers|clients|buyers|people|everyone|everybody)\s+(?:say|says|tell|tells|ask|asks|keep|keeps|love|loves)\b/i,
    why: "what customers are said to say",
  },
  { kind: "attributed", re: /\b(?:most|many|some)\s+(?:of\s+)?(?:our\s+)?(?:customers|clients|buyers)\b/i, why: "a claim about what customers do" },
  { kind: "attributed", re: /\b(?:log|sab|customer)\s+(?:kehte|kehti|poochte|bolte|bolti)\b/i, why: "what customers are said to say" },
  { kind: "attributed", re: /लोग\s+कहते|ग्राहक\s+कहते/, why: "what customers are said to say" },

  // A comparison with an alternative nobody named. This is the family
  // the two live misses belong to.
  {
    kind: "comparative",
    re: /\bif\s+you(?:'re|\s+are|\s+re)?\s+(?:used\s+to|tired\s+of|fed\s+up|sick\s+of)\b/i,
    why: "a comparison with an alternative that isn't named",
  },
  { kind: "comparative", re: /\bunlike\s+(?:other|most|the\s+rest|ordinary|regular|typical|cheap)\b/i, why: "a comparison with an alternative that isn't named" },
  { kind: "comparative", re: /\b(?:better|cleaner|stronger|longer|purer|safer|slower|faster)\s+than\s+(?:other|most|ordinary|regular|typical|the)\b/i, why: "a comparison with an alternative that isn't named" },
  { kind: "comparative", re: /\b(?:most|other)\s+\w+s\s+(?:don't|dont|do\s+not|can't|cant|cannot|won't|wont|fail)\b/i, why: "a claim about what competitors do not do" },
  { kind: "comparative", re: /\brather\s+than\s+(?:hitting|overwhelming|assaulting|blasting|screaming)\b/i, why: "a comparison with how something else behaves" },
  { kind: "comparative", re: /\b(?:doosre|dusre|baaki)\s+(?:log|jagah|brand|dukaan)\w*\b/i, why: "a comparison with an alternative that isn't named" },
];

/**
 * Everything the owner has actually written down, as one blob.
 *
 * Deliberately WIDER than storyVocabulary, which strips out the
 * catalogue on purpose because it is measuring specificity. Here the
 * catalogue counts: if the owner typed a word into a product
 * description, the model did not invent it, and that is the whole
 * question.
 */
export function recordedText(facts: BusinessFacts | null | undefined): string {
  if (!facts) return "";
  const parts: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(v);
  };
  for (const k of facts.ownerFacts ?? []) {
    add(k.content);
    // The TITLE is Hawlai's question, not the owner's words
    // (storyEcho.ts learnt this the hard way when a caption passed on
    // the word "work", which came from the title "How we work"). Titles
    // are left out here for the same reason.
  }
  for (const p of facts.products ?? []) {
    add(p.name);
    add(p.description);
  }
  for (const o of facts.offers ?? []) add(o.label);
  for (const s of facts.site?.pages ?? []) add(JSON.stringify(s ?? {}));
  add(facts.brand?.description);
  for (const p of facts.pillars ?? []) add(p);
  add(facts.city);
  return parts.join(" \n ").toLowerCase();
}

/** The words in a sentence that could carry its meaning — not the filler. */
export function distinctiveWords(sentence: string): string[] {
  return String(sentence ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .filter((w) => w.length >= 4 && !COMMON.has(w) && !/^\d+$/.test(w));
}

/**
 * Is there anything in the owner's records behind this sentence?
 *
 * ONE distinctive word is enough, on purpose — see the header. A
 * sentence with no distinctive words at all ("It all started here.") is
 * treated as UNSUPPORTED: there is nothing in it that could trace to
 * anything, and it is still asserting a history.
 *
 * THE TRIGGER IS NOT ITS OWN EVIDENCE. Caught by this module's own test
 * before it shipped: "started" is a distinctive word by the definition
 * above, so an owner who had recorded "I started in 2019 from home"
 * would have licensed "We started in a tiny kitchen" — on the word
 * "started", with the kitchen invented. So the phrase that MATCHED the
 * pattern is removed from the sentence before the evidence is counted,
 * for the same reason storyEcho ignores the titles Hawlai wrote: a
 * sentence cannot be its own source.
 */
export function tracesToRecord(sentence: string, recorded: string, trigger?: RegExp): boolean {
  if (!recorded) return false;
  const evidence = trigger ? String(sentence ?? "").replace(trigger, " ") : sentence;
  const words = distinctiveWords(evidence);
  if (!words.length) return false;
  return words.some((w) => recorded.includes(w));
}

export type NarrativeFinding = { kind: NarrativeKind; why: string; sentence: string };

export type NarrativeResult = {
  text: string;
  /** What was taken out, or flagged in draft mode. */
  findings: NarrativeFinding[];
};

/**
 * Narrative with no record behind it, withheld by SENTENCE.
 *
 * By sentence and not by phrase, matching stripUnsupported: a paragraph
 * rewritten around a deleted clause reads like a bug, and the owner
 * cannot tell what was changed.
 *
 * WITH NO FACTS AT ALL this withholds every narrative sentence, because
 * nothing could have excused one — the same reasoning as
 * stripUnverifiable (F-01). That is the fail-CLOSED direction and it is
 * the one a transient database error has to take.
 */
export function checkNarrative(
  text: string,
  facts: BusinessFacts | null | undefined,
  mode: ClaimsMode = "publish"
): NarrativeResult {
  const original = String(text ?? "");
  if (!original.trim()) return { text: original, findings: [] };

  const recorded = recordedText(facts);
  const kept: string[] = [];
  const findings: NarrativeFinding[] = [];

  for (const piece of pieces(original)) {
    const hit = PATTERNS.find((p) => p.re.test(piece));
    if (!hit || tracesToRecord(piece, recorded, hit.re)) {
      kept.push(piece);
      continue;
    }
    findings.push({ kind: hit.kind, why: hit.why, sentence: piece.trim() });
    // A draft is for the owner to read and fix, so the sentence stays
    // and is named. Anything going to a customer loses it.
    if (mode === "draft") kept.push(piece);
  }

  if (!findings.length) return { text: original, findings: [] };
  const cleaned = kept.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: mode === "draft" ? original : cleaned, findings };
}

/**
 * What the owner is told — naming the thing to add, not just the refusal.
 *
 * "I took a sentence out" with no way forward reads as a bug. The note
 * says which kind of sentence and what recording it would license.
 */
export function narrativeNote(findings: NarrativeFinding[], mode: ClaimsMode = "publish"): string | null {
  if (!findings.length) return null;
  const whys = Array.from(new Set(findings.map((f) => f.why)));
  const list = whys.length === 1 ? whys[0] : `${whys.slice(0, -1).join(", ")} and ${whys[whys.length - 1]}`;
  const verb = mode === "draft" ? "I've left in but can't back up" : "I took out";
  return `${verb} ${list} — nothing in your records says it. Write it down once in Business Knowledge and I can use it everywhere.`;
}

/**
 * The same check over a whole generated object, not one string.
 *
 * WIRED INTO guardOrMark RATHER THAN INTO EACH GENERATOR, deliberately.
 * Finding F-16 was that every protection in this product lived inside a
 * generator, so each new path started unguarded and nobody noticed until
 * something went out. guardOrMark is the one place all eight generators
 * already go through, so a ninth gets this for free.
 *
 * The walk mirrors guardOutput's: strings checked, `_` keys left alone,
 * and an array item whose text was emptied dropped with it — a hook that
 * was only an invented anecdote, a slide with no headline left. That
 * shape is now written out three times in this directory (guardOutput,
 * guardOrMark, here) and is worth collapsing into one walker — but not
 * in the same commit that changes what the walk DOES, because then a
 * regression could be either.
 */
export function guardNarrative<T>(
  output: T,
  facts: BusinessFacts | null | undefined,
  mode: ClaimsMode = "publish"
): { output: T; findings: NarrativeFinding[] } {
  const findings: NarrativeFinding[] = [];
  const emptied = (before: any, after: any) =>
    typeof before === "string" && before.trim() !== "" && String(after ?? "").trim() === "";

  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = checkNarrative(v, facts, mode);
      findings.push(...r.findings);
      return r.text;
    }
    if (Array.isArray(v)) {
      const out: any[] = [];
      for (const item of v) {
        const next = walk(item);
        if (emptied(item, next)) continue;
        if (
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          Object.keys(item).some((k) => !k.startsWith("_") && emptied(item[k], next[k]))
        )
          continue;
        out.push(next);
      }
      return out;
    }
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = k.startsWith("_") ? x : walk(x);
      return o;
    }
    return v;
  };

  return { output: walk(output) as T, findings };
}
