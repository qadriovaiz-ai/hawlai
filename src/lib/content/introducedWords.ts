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

/**
 * Second-person pronouns, for the one frame in which a superlative
 * ranks nothing of ours.
 */
const SECOND_PERSON = new Set([
  "you", "your", "yours",
  "aap", "aapko", "aapke", "aapki", "aapka",
  "tum", "tumhe", "tumhein", "tumhara", "tumhare", "tumhari",
]);

/**
 * Copulas and subjunctives that can close a Hinglish reader frame.
 *
 * Function words only — "be", "seem", "suit", "feel". Nothing here
 * names a thing anyone sells.
 */
const READER_FRAME_VERBS = new Set([
  "lage", "lagey", "lagega", "lagegi", "lge",
  "ho", "hai", "hoga", "hogi", "rahe",
  "mile", "milega", "milegi",
  "kare", "karo", "chahiye",
  "suits", "suit", "fits", "works", "feels", "is", "are",
]);

/**
 * Words that make a figure sound small.
 *
 * B16, FROM THE FOUNDER'S BLIND GRADING OF RUN 14 (2026-10-20). The
 * message said "We deliver to your door in Indore for just Rs 50", and
 * he marked it false for two reasons. One was the delivery area; the
 * other was "just" - a judgement that Rs 50 is a little, which no
 * record makes. The intensifier class holds purity and superlative
 * words, so nothing looked at it.
 *
 * THESE ARE ONLY A CLAIM IN FRONT OF A FIGURE, and that is the whole
 * reason this can be a list at all. "Only" and "sirf" were kept OUT of
 * the intensifier class on purpose, because "soy wax only" is often the
 * record's own phrasing and a flat word match emptied true sentences -
 * twice. "Only Rs 50" is a different act: it is not reporting the price,
 * it is saying the price is low. So the figure has to be there, and
 * `minimisesAFigure` below is what decides.
 */
const MINIMISERS = new Set([
  "just", "only", "merely", "simply", "mere",
  "sirf", "bas", "keval", "kewal", "matr",
]);

export type IntroducedWord = {
  sentenceIndex: number;
  word: string;
  kind: "intensifier" | "name" | "minimiser";
};

/**
 * Clauses, as token lists. Punctuation ends a clause; emoji are not
 * words and fall out with the rest of the non-letters.
 *
 * NEEDED BECAUSE POSITION IS THE ONLY THING THAT DISTINGUISHES the two
 * uses of a superlative, and a position is only meaningful inside the
 * clause it sits in.
 */
function clauses(text: string): string[][] {
  return String(text ?? "")
    .split(/[.,;:!?…—\n]+/)
    .map((part) => tokens(part))
    .filter((t) => t.length > 0);
}

/**
 * True when this superlative ranks THE READER'S OWN PREFERENCE rather
 * than anything the business sells.
 *
 * THE S2a WHATSAPP RUN OF 2026-10-19 is why this exists. The check
 * removed "Book your slot whenever suits you best" — reporting that it
 * says "best", and nothing on record says that. Nothing on record
 * needs to: "best" there is not a claim about the salon, it is an
 * adverb about whatever time suits the reader. A broadcast lost its
 * call to action to a guard that read a courtesy as a boast.
 *
 * THE DISTINCTION IS GRAMMATICAL, NOT A WORD. An intensifier makes a
 * claim when it qualifies a NOUN — "pure ghee", "the best price", "our
 * finest candles". It makes none when it is an ADVERB whose subject is
 * the reader — "suits you best", "jaise aapko best lage". Without a
 * part-of-speech tagger the surface signal for the second case is
 * narrow and exact: the superlative ENDS ITS CLAUSE and the word
 * immediately before it is a second-person pronoun. There is no noun
 * left for it to qualify, and the only thing being ranked is the
 * reader's convenience.
 *
 * HINGLISH PUTS THE VERB LAST, so clause-final is the wrong test for
 * it and my first version of this function failed its own Hinglish
 * case: "jab aapko best lage" has "lage" after the superlative, and
 * "aapko best lage" is the same courtesy as "suits you best". So the
 * frame admits one trailing copula or subjunctive. Those verbs are
 * grammatical function words, like the postpositions already in this
 * file's place check — they name no product, trade or business, which
 * is the only reason a list of them may live in code.
 *
 * WHAT THIS GIVES UP, stated rather than hidden: "whatever works best
 * for you" is still flagged, because "best" is neither clause-final nor
 * followed by one of these verbs. That has not been observed, and the
 * narrowing stays as tight as the fault it was built for. "Aapko
 * premium candle milegi" is still flagged too, and should be —
 * "premium" has a noun after it, which is exactly the case this does
 * not touch.
 */
/**
 * True when this minimiser is making a FIGURE sound small.
 *
 * The figure must be within the next two tokens, so "just Rs 50", "just
 * 50", "sirf 400 mein" and "only Rs 999" are caught while "soy wax
 * only", "only the finest" and "just message us" are not. Two tokens
 * because a currency word sits between in one language and after in
 * another.
 *
 * A NUMBER IS A NUMBER WHEREVER IT CAME FROM. The figure itself may be
 * perfectly true and on record - that is not what this is about. The
 * claim being added is that the amount is SMALL, and nothing in a
 * record says what counts as small.
 */
function minimisesAFigure(clause: string[], i: number): boolean {
  const CURRENCY = new Set(["rs", "inr", "rupees", "rupee", "r", "₹"]);
  for (const next of clause.slice(i + 1, i + 3)) {
    if (/[0-9]/.test(next)) return true;
    if (!CURRENCY.has(next)) return false;
  }
  return false;
}

function ranksTheReader(clause: string[], i: number): boolean {
  if (i === 0 || !SECOND_PERSON.has(clause[i - 1])) return false;
  const after = clause.slice(i + 1);
  // "suits you best" — nothing left for it to qualify.
  if (after.length === 0) return true;
  // "aapko best lage" — nothing left but the verb.
  return after.length === 1 && READER_FRAME_VERBS.has(after[0]);
}

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
  // A LIST MARKER IS NOT THE FIRST WORD.
  //
  // Run 9 removed two bullets — "- Har candle hand-poured hai" and
  // "- Ek candle jal sakti hai 40 hours tak" — reporting "har" and "ek"
  // as invented names. The hyphen took the sentence-initial slot, so the
  // real first word was checked, and in Hinglish the first word of a
  // line is routinely a capitalised determiner. The marker is
  // punctuation, not a word.
  const line = String(sentence ?? "").replace(/^\s*(?:[-*•–—]+|\d+[.)])\s*/, "");
  const words = line.split(/[^\p{L}\p{N}%'’-]+/u).filter(Boolean);
  const capitalised = words.slice(1).filter((w) => /^\p{Lu}\p{Ll}+/u.test(w));

  // CAPITALISATION ONLY MEANS "NAME" IN PROSE.
  //
  // The run of 19 October removed four button labels — "Slot Book
  // Karo", "Candle Dekho", "Book a Consultation" — because every word
  // after the first is capitalised in Title Case, so every one of them
  // looked like a name the writer had invented. They are not claims at
  // all; they are the thing the reader clicks.
  //
  // So when most of a line is capitalised, capitalisation carries no
  // information about names and this check abstains. The intensifier
  // check still runs on it: "Purest Ghee In Town" as a button is still
  // a claim.
  const content = words.filter((w) => /\p{L}/u.test(w));
  const titleCased = content.filter((w) => /^\p{Lu}/u.test(w)).length;
  if (content.length <= 6 && titleCased > content.length / 2) return [];

  // ONLY A WORD IN A PLACE POSITION, and this is a narrowing with a
  // cost that is worth naming.
  //
  // Run 10 removed "Khush Aamdeed — aap sahi jagah aaye!" because
  // "Aamdeed" is a capitalised Hinglish word in the middle of a
  // greeting. Capitalisation alone cannot tell "Aamdeed" from "Indore":
  // both are capitalised words this check has never seen.
  //
  // What CAN tell them apart is position. The fault this check exists
  // for is location invention — "right here in Indore", "Indore mein",
  // "wherever you are in India" — and an invented place arrives after a
  // preposition of place in English or before a postposition in
  // Hinglish. A greeting's capitalised word does neither.
  //
  // WHAT THIS GIVES UP: an invented brand or person's name that is not
  // in a place position — "our wax comes from Golden Brands" is still
  // caught because of "from", but "Golden Brands wax, hand-poured" no
  // longer is. That was never an observed failure, and the claim
  // extractor sees it as a material claim with nothing to cite. A
  // narrower check that holds beats a wider one that deletes greetings.
  const lower = words.map((w) => w.toLowerCase());
  const BEFORE = new Set(["in", "from", "at", "near", "across", "throughout", "around", "over", "to"]);
  const AFTER = new Set(["mein", "me", "se", "tak", "wale", "wali", "ka", "ki"]);
  const inPlacePosition = (word: string): boolean => {
    const i = lower.indexOf(word.toLowerCase());
    if (i < 0) return false;
    return (i > 0 && BEFORE.has(lower[i - 1])) || (i + 1 < lower.length && AFTER.has(lower[i + 1]));
  };

  return capitalised.filter(inPlacePosition).map((w) => w.toLowerCase());
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
    for (const clause of clauses(sentence)) {
      clause.forEach((word, i) => {
        if (vocabulary.has(word) || seen.has(word)) return;
        if (INTENSIFIERS.has(word)) {
          if (ranksTheReader(clause, i)) return;
          seen.add(word);
          found.push({ sentenceIndex, word, kind: "intensifier" });
          return;
        }
        // A minimiser is a claim only in front of a figure.
        if (MINIMISERS.has(word) && minimisesAFigure(clause, i)) {
          seen.add(word);
          found.push({ sentenceIndex, word, kind: "minimiser" });
        }
      });
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
        : f.kind === "minimiser"
          ? `Removed "${(sentences[f.sentenceIndex] ?? "").trim()}" — "${f.word}" says the amount is small, and that is your call to make, not mine.`
          : `Removed "${(sentences[f.sentenceIndex] ?? "").trim()}" — it names "${f.word}", which is nowhere in your records.`
    )
    .join("\n");
}
