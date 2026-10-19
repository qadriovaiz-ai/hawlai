// WORDS THE WRITER BROUGHT THAT NOBODY GAVE IT.
//
// Founder's direction, 19 October 2026: stop patching symptoms. "pure"
// had been caught and re-fixed three times — after "asli" and
// "premium" — and each fix added a word to a list inside a PROMPT. A
// prompt rule is applied unevenly by definition: the same rule caught
// "pure desi ghee" in one run and let it through in the next.
//
// THE STRUCTURAL MOVE IS NOT A LONGER LIST. It is to stop asking the
// model to police itself and check in code, every time, against what
// the model was actually given.
//
// The approved claims are a CLOSED SET. So two classes of word can be
// decided by looking:
//
//   an intensifier   a degree or absolute qualifier — pure, genuine,
//                    finest, only, entirely, 100%, asli, shudh. These
//                    assert something beyond the thing they attach to,
//                    so one that appears in no approved claim is an
//                    assertion nobody made. The list is a LINGUISTIC
//                    class, not a product vocabulary: it names no
//                    trade, no material and no business, which is why
//                    it may live in code at all.
//
//   a proper noun    a capitalised word the writer introduced. "Indore"
//                    survived three times in one run while NO location
//                    record existed anywhere in the context — the model
//                    reached for a generic Indian city from its own
//                    prior. No gazetteer can anticipate that; "a name
//                    you were not given" can.
//
// WHY THIS CATCHES THE NEXT ONE TOO. A fourth boosting adjective and a
// different invented city both fail the same check, without anybody
// adding a word.

/**
 * Degree and absolute qualifiers.
 *
 * A CLOSED GRAMMATICAL CLASS, and that is what makes it legitimate
 * where a list of materials or cities would not be. Each of these
 * asserts a degree about whatever it modifies; none of them names a
 * product, a trade or a place. multiTenantVocabulary permits this for
 * exactly that reason.
 */
const INTENSIFIERS = new Set([
  // purity and authenticity
  "pure", "purest", "genuine", "authentic", "real", "unadulterated", "natural",
  "asli", "shudh", "shuddh", "khalis",
  // superlative and rank
  "best", "finest", "top", "premium", "luxury", "superior", "unmatched", "unbeatable",
  "perfect", "ultimate", "leading",
  "sabse", "behtareen", "lajawab",
]);

// TOTALITY WORDS ARE DELIBERATELY ABSENT — only, every, always, never,
// entirely, poora, bilkul, sirf, hi.
//
// I had them here, and my own tests found two false positives within
// minutes: "Hi" was flagged because Hinglish "hi" (as in "sirf … hi")
// was on the list, and "We never use cheap paraffin wax" was emptied
// because "never" was, though it is a fair reading of a record that
// says the business does not use it.
//
// The founder's rule names a class: adjectives that boost QUALITY,
// PURITY or DEGREE. A totality word is a different thing — usually a
// paraphrase of what the record already says, and sometimes the
// record's own word, as "soy wax only" is. Those belong to the judge,
// under its rule about wording and word order, not to a code check that
// cannot read the sentence.
//
// Widening a class because it felt adjacent is how a guard starts
// deleting true copy, which is the error this whole sequence keeps
// producing in one form or another.

export type IntroducedWord = {
  sentenceIndex: number;
  word: string;
  kind: "intensifier" | "name";
};

/** Words, lowercased, with punctuation gone. Keeps "100%" as a token. */
function tokens(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The capitalised words a sentence introduces, sentence-initial ones
 * aside.
 *
 * A word is a candidate when it starts with an upper-case letter and is
 * not the first word of the sentence. "100%" and ALL-CAPS shouting are
 * not names. Devanagari has no case, so this finds nothing there — a
 * real limit, stated rather than hidden, and the reason the intensifier
 * class carries Hinglish words of its own.
 */
function capitalisedWords(sentence: string): string[] {
  const words = String(sentence ?? "").split(/[^\p{L}\p{N}%'’-]+/u).filter(Boolean);
  return words
    .slice(1)
    .filter((w) => /^\p{Lu}\p{Ll}+/u.test(w))
    .map((w) => w.toLowerCase());
}

/**
 * Words in the copy that nothing the writer was given accounts for.
 *
 * `allowed` is everything legitimately in front of the writer: the
 * approved claims, the records they cite, the business's own name and
 * category, and what the owner typed. A word there is the owner's, not
 * the model's.
 */
export function introducedWords(sentences: string[], allowed: string[]): IntroducedWord[] {
  const vocabulary = new Set(allowed.flatMap(tokens));
  const found: IntroducedWord[] = [];

  sentences.forEach((sentence, sentenceIndex) => {
    const seen = new Set<string>();
    for (const word of tokens(sentence)) {
      if (!INTENSIFIERS.has(word) || vocabulary.has(word) || seen.has(word)) continue;
      seen.add(word);
      found.push({ sentenceIndex, word, kind: "intensifier" });
    }
    for (const word of capitalisedWords(sentence)) {
      if (vocabulary.has(word) || seen.has(word)) continue;
      // A number-word like "100" is not a name.
      if (/^\d+%?$/.test(word)) continue;
      seen.add(word);
      found.push({ sentenceIndex, word, kind: "name" });
    }
  });

  return found;
}

/** What the owner is told, one line per word. */
export function introducedNote(found: IntroducedWord[], sentences: string[]): string | null {
  if (!found.length) return null;
  return found
    .map((f) =>
      f.kind === "intensifier"
        ? `Removed "${(sentences[f.sentenceIndex] ?? "").trim()}" — it says "${f.word}", and nothing on record says that.`
        : `Removed "${(sentences[f.sentenceIndex] ?? "").trim()}" — it names "${f.word}", which is nowhere in your records.`
    )
    .join("\n");
}
