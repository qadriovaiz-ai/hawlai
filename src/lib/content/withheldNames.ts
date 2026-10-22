// DOES THIS SENTENCE NAME SOMETHING THE WRITER WAS NOT GIVEN?
//
// THE ROOT CAUSE BEHIND FOUR SEPARATE "UNSUPPORTED CLAIM LEAK"
// FINDINGS, named by the founder on 2026-10-22 after the third one:
// "jahan bhi naya field test karte hain, wahi leak nikal aati hai".
// He was right that they are one bug, and right that it is not a
// field-by-field problem.
//
// Every check in the door runs on every field - one list of sentences,
// four checks, no field exceptions. What varies is not the FIELD, it is
// whether anything types the sentence as a claim at all:
//
//   the scope filter   lives in verifyClaims and can only judge claims
//                      the extractor REPORTED. No claim reported means
//                      no scope check, and the sentence publishes.
//   the extractor      is told, correctly, that "greetings, feelings,
//                      invitations, questions and calls to action are
//                      NOT claims" (rule 3). So it reports nothing for
//                      "Book your keratin treatment or haircut in
//                      Indore today" - and the product named in it was
//                      WITHHELD from this piece.
//   introducedWords    needs a CAPITAL to see a name at all, so
//                      "keratin treatment" in lower case is invisible
//                      to it, and it abstains entirely on a Title-Cased
//                      line of six words or fewer, which is every title.
//
// Measured free on 2026-10-22, salon-08's shipped sentence: names the
// withheld product YES, flagged by any existing check NO.
//
// SO THIS CHECK ASKS THE ONE QUESTION NONE OF THEM ASK, in code, with
// no model and no money: of the things this business has records for,
// which were kept back from this piece, and does the copy name one
// anyway? It does not care which field the words are in, what kind of
// sentence it is, or whether anything called it a claim.
//
// WHY A NAME AND NOT A CLAIM: naming a product the writer was not given
// is an availability claim whatever grammar surrounds it. "We also do
// keratin treatments" and "Book your keratin treatment" differ in form
// and not at all in what a customer would turn up expecting.

import { FUNCTION_WORDS } from "@/lib/content/functionWords";

/** The words of a name that carry it, lower-cased. */
function contentWords(name: string): string[] {
  return String(name ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !FUNCTION_WORDS.has(w) && !/^\d+$/.test(w));
}

export type WithheldFinding = { sentenceIndex: number; name: string; matched: string[] };

/**
 * Sentences that name a withheld subject.
 *
 * `allowed` is everything the writer legitimately had: the names in
 * this piece's slice, the business's own name and category, and what
 * the owner typed. A word that appears there cannot be the reason a
 * sentence is refused.
 *
 * THE DISTINCTIVE WORDS DECIDE, and this is the whole safety of it.
 * "Desi ghee 500ml" withheld while "Paneer 250g" is allowed must not
 * delete a sentence for saying "250g", and a trade whose two products
 * share a word must not lose the sentence that names the permitted one.
 * So a withheld name's words are reduced to those that appear NOWHERE
 * in what the writer was given, and the sentence must contain ALL of
 * them before anything is removed. A name with no distinctive words
 * left cannot fire at all - which is the right failure, because
 * deleting true copy is the more expensive mistake and this codebase
 * has made it eight times.
 */
export function withheldNames(sentences: string[], withheld: string[], allowed: string[]): WithheldFinding[] {
  const allowedWords = new Set(allowed.flatMap((a) => contentWords(a)));
  const found: WithheldFinding[] = [];
  for (const name of withheld) {
    const distinctive = contentWords(name).filter((w) => !allowedWords.has(w));
    if (!distinctive.length) continue;
    sentences.forEach((sentence, sentenceIndex) => {
      const words = new Set(contentWords(sentence));
      if (distinctive.every((w) => words.has(w))) found.push({ sentenceIndex, name, matched: distinctive });
    });
  }
  return found;
}

/** What the owner is told, one line per removed sentence. */
export function withheldNote(found: WithheldFinding[], published: string[]): string {
  const lines = found.map(
    (f) =>
      `Removed "${published[f.sentenceIndex] ?? ""}" — it names ${f.name}, which was not among the facts chosen for this piece.`
  );
  return [...new Set(lines)].join("\n");
}
