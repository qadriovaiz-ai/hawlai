// A SENTENCE THAT IS NOT COPY AT ALL.
//
// The sixth S2a WhatsApp run, 20 October 2026. dairy-05's customer
// message contained this:
//
//   FSSAI: [LICENSE NUMBER NEEDED].
//   Cannot finalize without: (1) FSSAI licence number to include;
//   (2) Confirmation that bilona/hand-churned applies to Paneer 250g
//   specifically; (3) Status of FIRST10 offer (active? order or
//   product level?); (4) Shipping coverage area.
//
// Every guard in the pipeline let it through, and every one of them was
// right to by its own lights: there is no claim in it, no figure, no
// strengthening word, no invented name. It is not a false claim. It is
// the model talking to whoever asked for the copy, inside the field
// that goes to the customer — and an unfilled slot that would have been
// sent to a real person as "[LICENSE NUMBER NEEDED]".
//
// THIS IS WORSE THAN AN UNSUPPORTED CLAIM, because an unsupported claim
// is at least addressed to the reader. So it is checked in code, before
// any model call, like introducedWords — the two run together and
// report separately, because they are different faults.
//
// WHY A SLOT IS THE GENERAL CASE. The writer reaches for a placeholder
// exactly when it knows a fact is wanted and does not have the
// specifics — which is the situation this whole pipeline creates on
// purpose, every time a record is thin. So the shape will recur
// whatever the wording, and the shape is what this looks for.

/** An unfilled slot: a bracketed hole, or a rule of underscores. */
const SLOT = /\[[^\]]*\]|\{\{[^}]*\}\}|<[A-Za-z][^>]*>|_{3,}/;

/**
 * Phrases by which a model reports its own inability to the requester.
 *
 * A SHORT LIST, AND DELIBERATELY SO. This guard removes a sentence, and
 * a removal guard that over-fires deletes true copy — which has been
 * the recurring fault of this whole sequence. Nothing here could be a
 * line written to a customer: a business does not tell a reader it
 * cannot finalise their broadcast. "Please provide" and "fill in" were
 * on my first list and came off it, because "please provide your
 * address" and "fill in the form" are ordinary copy.
 *
 * WHAT THIS GIVES UP: meta-text phrased in words that are not here
 * still passes. The slot check above is the general one; this catches
 * the case where the model wrote its questions out in prose instead.
 */
const META = [
  "cannot finalize",
  "cannot finalise",
  "cannot be finalized",
  "cannot be finalised",
  "cannot complete",
  "need the following",
  "needs the following",
  "pending confirmation",
  "to be confirmed",
  "placeholder",
  "tbd",
  "todo",
];

export type NotCopy = { sentenceIndex: number; reason: "slot" | "meta" };

/** The sentences that are not copy, with which fault each one is. */
export function notCopySentences(sentences: string[]): NotCopy[] {
  const found: NotCopy[] = [];
  sentences.forEach((sentence, sentenceIndex) => {
    const text = String(sentence ?? "");
    if (SLOT.test(text)) {
      found.push({ sentenceIndex, reason: "slot" });
      return;
    }
    const lower = text.toLowerCase();
    if (META.some((phrase) => lower.includes(phrase))) found.push({ sentenceIndex, reason: "meta" });
  });
  return found;
}

/** What the owner is told. The reason matters: these are not claims. */
export function notCopyNote(found: NotCopy[], sentences: string[]): string | null {
  if (!found.length) return null;
  return found
    .map((f) =>
      f.reason === "slot"
        ? `Removed "${(sentences[f.sentenceIndex] ?? "").trim()}" — it has a blank in it that was never filled in, so it must not go out.`
        : `Removed "${(sentences[f.sentenceIndex] ?? "").trim()}" — that is a note about writing this message, not part of the message.`
    )
    .join("\n");
}
