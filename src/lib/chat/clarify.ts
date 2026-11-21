// "Which one did you mean?" — asked so that the answer is possible.
//
// THE INCIDENT, 21 November 2026, and it took two turns to go wrong.
//
// The owner asked for a collection's description without naming one.
// The tool resolved nothing, correctly, and returned
// `question: "Which collection did you mean?"` with the store's three
// real collections in a `candidates` field beside it.
//
// TURN ONE: the chat relayed the question and NOT the list. It asked
// him to recall a name it had just been handed.
//
// TURN TWO, the worse half: he answered "Home page" — a real
// collection, Shopify's own default, handle `frontpage`. The model did
// not call the tool again. It told him "Home page is not a collection,
// it's a regular website page", contradicting the result it already
// had, in which Home page was listed as a collection.
//
// So two separate failures with one cause: THE ANSWER WAS ADVISORY. A
// field beside the question is something the model may or may not
// use, and a name that "sounds like a page" was enough to override it.
//
// WHAT THIS CHANGES. The names go INSIDE the question, so relaying the
// question relays them, and the note says plainly that the list came
// from the platform a moment ago and is not open to argument. Same
// mechanism the product already relies on for `_claimsNote`, which
// the system prompt tells the model to repeat rather than summarise.
//
// ONE DEFINITION, because there are five of these — Shopify pages,
// collections and blogs, and the built-in site's pages twice — and
// five copies of this reasoning would drift on four of them.

export type Choice = { key: string; title: string };

export type Clarification = {
  needs_clarification: true;
  question: string;
  candidates: Record<string, string>[];
  note: string;
};

/**
 * Ask which one, with the options in the question.
 *
 * `keyName` is what the field is called in the reply — "collection",
 * "page", "blog" — so the follow-up call has something to pass back.
 *
 * `confirmMessage` is for the single-near-match case ("Did you mean
 * X?"), which is a different question from "which of these?" and is
 * answerable with a yes.
 */
export function clarifyChoice(opts: {
  noun: string;
  keyName: string;
  candidates: Choice[];
  source: string;
  confirmMessage?: string | null;
}): Clarification {
  const titles = opts.candidates.map((c) => c.title).filter(Boolean);
  const listed = titles.join(", ");

  const question =
    opts.confirmMessage ||
    (titles.length ? `Which ${opts.noun} — ${listed}?` : `Which ${opts.noun} did you mean?`);

  return {
    needs_clarification: true,
    question,
    candidates: opts.candidates.map((c) => ({ [opts.keyName]: c.key, title: c.title })),
    note: titles.length
      ? `These are the ${opts.noun}s that exist on ${opts.source}, read just now: ${listed}. ` +
        `Show them to the owner and let him pick — do not ask him to remember a name you were just given. ` +
        `Never tell him one of these is "not a ${opts.noun}" or is "something else instead": the list is what the ` +
        `platform returned, and your sense of what a name sounds like is not evidence against it. ` +
        `A ${opts.noun} can be called anything. When he names one, call this tool again with it.`
      : `Nothing on ${opts.source} matched. Say so plainly and ask what he meant — do not guess, and do not ` +
        `tell him a ${opts.noun} does not exist unless this tool said so.`,
  };
}
