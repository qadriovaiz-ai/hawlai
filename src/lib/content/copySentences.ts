// The sentences of a generated piece, and how to put one back short.
//
// C2 steps 4a and 4b work per SENTENCE: the extractor is given a
// numbered list and returns claims pointing at those numbers, and the
// verifier returns the numbers to drop. So the same flattening has to
// produce the same order twice, which is why it lives in one function
// rather than at each call site.
//
// NO MODEL CALL HERE. Pure string work, which is also why it is not in
// generateCopy.ts: that file is the door and is long enough.

import { pieces } from "@/lib/claims/claimCheck";

export type CopySentence = {
  /** Which output field it came from: "subject", "body", "bullets". */
  field: string;
  /** Index within that field's own list, for an array field. */
  slot: number;
  /** What was written, and what gets published. Removal matches on this. */
  text: string;
  /**
   * The same sentence with hashtags opened into words, for the checks.
   *
   * THE FOUNDER'S DIRECTION OF 2026-10-20: a hashtag must go through the
   * same claim check, the same vocabulary and scope guard and the same
   * removal list as body text. It looked like three separate faults and
   * it is one - A HASHTAG WAS BEING ANALYSED AS OPAQUE PROSE:
   *
   *   the grading sheet   classifySentence("#SoyWaxOnly") is "feeling",
   *                       so 26 of the 29 hashtag rows in the social
   *                       sheet told the grader they were not claims.
   *                       The human never had to rule on
   *                       "#HandPouredInShahjahanpur"
   *   the extractor       was handed one unreadable token rather than
   *                       words, so whether a claim inside a tag
   *                       reached the judge was luck
   *   the removal         blanked an array element to "" instead of
   *                       dropping it, so a refused tag published as an
   *                       empty one
   *
   * So the analysed form is separate from the published one. The checks
   * read "Soy Wax Only"; the post still says "#SoyWaxOnly".
   */
  analysed: string;
};

/**
 * A hashtag opened into the words it is made of.
 *
 * "#SoyWaxOnly" becomes "Soy Wax Only", "#candlebyqaaf" is left alone
 * because there is no case boundary to split on, and ordinary prose
 * passes through untouched. The same case-boundary rule the
 * introduced-word check has used since the social cases found boosters
 * hiding inside tags.
 */
/**
 * A run of hashtags, split into one tag each.
 *
 * Whitespace, commas and bullets between tags are separators. A string
 * with no "#" in it comes back whole, because a hashtags field is not
 * always only hashtags.
 */
export function splitTags(text: string): string[] {
  const t = String(text ?? "").trim();
  if (!t.includes("#")) return t ? [t] : [];
  return t
    .split(/[\s,·•]+(?=#)/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function expandHashtags(text: string): string {
  return String(text ?? "").replace(/#([\p{L}\p{N}_]+)/gu, (_m, body: string) =>
    String(body)
      .replace(/_+/g, " ")
      // AN ACRONYM RUNS INTO THE NEXT WORD WITH NO LOWER-CASE BOUNDARY,
      // and that defeated the whole expansion on 2026-10-22.
      //
      // "#FSSAICertified" has no lower-to-upper transition, so the rule
      // below never fired and the tag reached every check as the single
      // token "FSSAICertified" — in no vocabulary, and not matched as a
      // name either, because a name test wants one capital followed by
      // lower case. An opaque token is exactly the state the hashtag
      // work of 20 October was supposed to end: "#FreshPaneer" split and
      // was caught, "#FSSAICertified" did not and published.
      //
      // So a capital that begins a lower-cased word is a boundary even
      // when the capital before it is part of a run: FSSAI|Certified.
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
      .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
      .trim()
  );
}

/**
 * Is this field a LABEL rather than prose?
 *
 * THE BLIND SPOT THE FOUNDER FOUND ON 2026-10-22. The introduced-name
 * check abstains when most of a short line is capitalised, because on
 * 19 October it was deleting buttons — "Book a Consultation", "Slot
 * Book Karo" — for being Title Case. A title is ALWAYS Title Case and
 * always short, so that abstention made every title permanently
 * invisible to the name check, and "Smooth Finish" published as a
 * product title with nothing on record for it.
 *
 * A label field has no prose for capitalisation to carry information
 * about, so the abstention has nothing to protect there. Prose fields —
 * body, message, text, description, subject — keep it, because that is
 * where the greetings it was built for live.
 */
export function isLabelField(field: string): boolean {
  return field === "hashtags" || field === "title" || field === "headline" || field === "ctaLabel" || field === "cta";
}

/** Every string in a generated output, in a stable order, split into sentences. */
export function copySentences(output: unknown): CopySentence[] {
  const out: CopySentence[] = [];
  for (const [field, value] of Object.entries((output ?? {}) as Record<string, unknown>)) {
    // Underscore keys are Hawlai's own notes to the owner. They are not
    // copy, and running the verifier over _claimsNote would check the
    // guard's words rather than the model's — a mistake this codebase
    // has made twice before, asserting over a note that QUOTES the
    // thing it is reporting.
    if (field.startsWith("_")) continue;
    forEachString(value, 0, (text, slot) => {
      // ONE TAG IS ONE SENTENCE, whatever shape the model returned it in.
      //
      // THE FOUNDER'S GRADING OF 2026-10-21: dairy-09 shipped
      // "#ShreeDairy #BilonaGhee #FreshPaneer" as ONE string while
      // dairy-03 shipped three separate array items. The same three
      // claims, and in the first shape they were one sentence - so a
      // refusal would have taken all three tags out together, two of
      // them true, and the extractor saw one jumble instead of three
      // labels.
      //
      // A hashtag ends where the next one begins. That is a sentence
      // boundary `pieces` has no reason to know about.
      const units = field === "hashtags" ? splitTags(text) : pieces(text);
      for (const sentence of units) {
        const trimmed = sentence.trim();
        if (trimmed) out.push({ field, slot, text: trimmed, analysed: expandHashtags(trimmed) });
      }
    });
  }
  return out;
}

function forEachString(value: unknown, slot: number, visit: (text: string, slot: number) => void): void {
  if (typeof value === "string") {
    if (value.trim()) visit(value, slot);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => forEachString(v, i, visit));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!k.startsWith("_")) forEachString(v, slot, visit);
    }
  }
}

/**
 * The same output with the named sentences gone.
 *
 * A FIELD THAT LOSES EVERY SENTENCE BECOMES EMPTY, NOT DELETED. An
 * email whose subject is removed must arrive with an empty subject the
 * caller can see and refuse, not with no subject key at all — a missing
 * key reads downstream as "this surface does not have subjects".
 */
export function withoutSentences(output: any, sentences: CopySentence[], dropIndices: number[]): any {
  const drop = new Set(dropIndices);
  if (!drop.size) return output;
  // Which exact texts to remove, per field and slot. Matching on text
  // rather than re-splitting keeps this independent of how the
  // splitting behaved the first time.
  const removeByKey = new Map<string, Set<string>>();
  sentences.forEach((s, i) => {
    if (!drop.has(i)) return;
    const key = `${s.field}#${s.slot}`;
    const set = removeByKey.get(key) ?? new Set<string>();
    set.add(s.text);
    removeByKey.set(key, set);
  });

  // THE SAME SPLIT ON BOTH SIDES, OR THE REMOVAL SILENTLY DOES
  // NOTHING.
  //
  // copySentences started splitting a hashtag run into one tag per
  // sentence; this re-split with `pieces`, which keeps the run whole,
  // so "#FreshPaneer" was never found among the pieces and nothing
  // was removed - while the owner's note said it had been. A note
  // claiming a removal that did not happen is worse than no note: it
  // is the pipeline telling the owner it protected them when it did
  // not.
  //
  // Found by mutation M55, which survived my first test of this
  // because that test asserted splitTags() directly rather than the
  // property.
  const strip = (text: string, key: string, field: string): string => {
    const remove = removeByKey.get(key);
    if (!remove) return text;
    const units = field === "hashtags" ? splitTags(text) : pieces(text);
    const kept = units.filter((p) => !remove.has(p.trim()));
    const joined = field === "hashtags" ? kept.join(" ") : kept.join("");
    return joined
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const walk = (value: unknown, field: string, slot: number): unknown => {
    if (typeof value === "string") return strip(value, `${field}#${slot}`, field);
    // AN ARRAY ELEMENT IS DROPPED, NOT BLANKED, and that is the one
    // place the "empty not missing" rule above does not apply. An email
    // whose SUBJECT is removed must arrive with an empty subject the
    // caller can see; a hashtag whose every word was refused must not
    // publish as an empty hashtag beside the real ones.
    if (Array.isArray(value)) return value.map((v, i) => walk(v, field, i)).filter((v) => !(typeof v === "string" && !v.trim()));
    if (value && typeof value === "object") {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        copy[k] = k.startsWith("_") ? v : walk(v, field, slot);
      }
      return copy;
    }
    return value;
  };

  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(output ?? {})) {
    result[field] = field.startsWith("_") ? value : walk(value, field, 0);
  }
  return result;
}
