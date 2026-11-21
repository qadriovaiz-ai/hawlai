// "Paste it in yourself" — the one answer a failure may never give.
//
// THE INCIDENT (21 November 2026). A Shopify page edit refused for a
// reason the model could not satisfy: the handler read a parameter the
// tool never declared, so it asked for text it had no field for. The
// model tried twice, then improvised — it printed the new page copy in
// the chat and told the owner to paste it into his Shopify admin
// himself, apologising for the extra step.
//
// WHY THAT IS NOT A HELPFUL FALLBACK. Everything this product does to
// a live surface goes through one path: a tool resolves the target, a
// preview shows the before and after, the owner approves, the executor
// re-reads and writes, and a row records what happened. A sentence
// telling the owner to do it by hand walks around ALL of it — no
// preview, no approval record, no staleness check, no claims check on
// the copy, and nothing to undo with. The work still happens; only the
// machinery is missing. That is worse than the failure it was trying
// to soften, and the owner cannot see what he lost.
//
// So the rule, in the founder's words: say the failure plainly, then
// ask whether to retry or stop.
//
// GENERAL, NOT SHOPIFY. The incident was Shopify, the rule is not: any
// tool, any surface, any failure. A reply that hands over the content
// is the thing being caught, whatever it was for.
//
// WHAT THIS DELIBERATELY DOES NOT CATCH, because the distinction is
// the whole design: a PREREQUISITE the owner genuinely must do
// himself. "This store has no blog yet — create one in Shopify under
// Online Store, then ask again" is correct and must survive. So is
// "connect Shopify from Settings first", and so is pointing at Website
// Builder for a thing chat cannot do at all. None of those hand over
// content; they name a door only the owner can open.
//
// The signal is therefore narrow on purpose: handing over COPY to be
// pasted somewhere, or telling the owner to do the thing manually.
// Mentioning an external admin is not enough on its own.
//
// SAME SHAPE AS replyClaims.ts, and the same reason: chat is a
// conversation, so the sentence is WITHHELD AND NAMED rather than
// silently rewritten. Half an explanation disappearing reads as a bug.

/** Quoted spans are masked, so the product can quote the rule it is enforcing. */
const QUOTE = /[""]([^""]{1,400})[""]|"([^"]{1,400})"/g;

function maskQuotes(text: string): { masked: string; restore: (s: string) => string } {
  const held: string[] = [];
  const masked = text.replace(QUOTE, (whole) => {
    held.push(whole);
    return `\u0000Q${held.length - 1}\u0000`;
  });
  return {
    masked,
    restore: (s: string) => s.replace(/\u0000Q(\d+)\u0000/g, (_, i) => held[Number(i)] ?? ""),
  };
}

/**
 * Handing over content to be pasted, or telling the owner to do it by
 * hand.
 *
 * English and Hinglish, because the chat answers in whatever the owner
 * writes in and the incident reply was English inside a Hinglish
 * conversation.
 */
const HANDOVER = [
  // Copy/paste, in any order, with or without a destination.
  /\b(copy|paste)\b[^.!?]{0,80}\b(paste|copy|into|in to|admin|dashboard|panel)\b/i,
  /\bcopy the (text|content|copy|words)\b/i,
  /\bpaste (it|this|the text|the following|below)\b/i,
  // Doing it by hand, said outright.
  /\b(do|add|update|change|set|put) (it|this|them|that) (in |into )?manually\b/i,
  /\bmanually (paste|add|update|enter|type|put|copy)\b/i,
  /\byou(?:'ll| will)? (?:have to|need to) do (?:it|this) (?:yourself|manually|by hand)\b/i,
  /\bby hand\b[^.!?]{0,40}\b(instead|yourself)\b/i,
  // Hinglish. "khud paste kar lo", "manually daal do", "jaake daal do".
  /\bkhud\b[^.!?]{0,40}\b(paste|daal|add|kar lo|karlo|likh)/i,
  /\bmanually\b[^.!?]{0,30}\b(daal|daalo|add|kar)/i,
  /\b(paste|copy)\b[^.!?]{0,40}\bkar (lo|lijiye|dena|do)\b/i,
  /\bjaake\b[^.!?]{0,40}\b(daal|add|paste|likh)/i,
];

/**
 * HAWLAI DOING IT IS NOT HAWLAI HANDING IT OVER.
 *
 * "I'll paste the summary into the report for you" is the product
 * working, and the first version of this guard withheld it — the broad
 * copy/paste-then-destination pattern could not tell who the actor
 * was. The whole rule is about handing the job BACK, so a first-person
 * actor settles it.
 *
 * Checked before the handover patterns, like PREREQUISITE.
 */
const HAWLAI_IS_ACTING = [
  // THE PRONOUN MUST BE THE ACTOR OF THE VERB, not merely near it.
  // The first version allowed 40 characters between them and a bare
  // `I`, which excused the real incident: "Here's what I'd suggest:
  // copy the text below and paste it into your Shopify admin" matched
  // on the `I` in "I'd" and the `copy` four words later. "I'd suggest"
  // is Hawlai giving ADVICE to the owner; "I'll paste" is Hawlai doing
  // it. Only the second is excused, so the verb must follow the
  // pronoun directly, with at most one adverb in between.
  //
  // `I'd` is deliberately absent for the same reason: it introduces a
  // suggestion, never an action.
  /\b(I'll|I will|I can|I've|I have|I'm going to|let me)\s+(just\s+|also\s+|now\s+|then\s+)?(paste|copy|add|put|update)\b/i,
  // Hinglish first person, same shape.
  /\b(main|mai|m[ae]in)\s+(hi\s+|khud\s+)?(paste|copy|daal|add)\b/i,
];

/**
 * A door only the owner can open is not a workaround.
 *
 * Checked BEFORE the handover patterns on the same sentence, so a
 * legitimate prerequisite wins. "Create a blog in Shopify, then ask
 * again" must survive even though it names an external admin.
 */
const PREREQUISITE = [
  /\b(create|make|set up|add)\b[^.!?]{0,60}\b(then|and then)\b[^.!?]{0,40}\b(ask|tell|say) (me|again)\b/i,
  /\bconnect\b[^.!?]{0,50}\bfrom settings\b/i,
  /\bneeds? (connecting|reconnecting)\b/i,
  /\bno (blog|store|website|collection|page)s? yet\b/i,
];

export type WorkaroundCheck = {
  /** The reply with any handover sentence withheld. */
  reply: string;
  /** Each withheld sentence, for the note and for the record. */
  withheld: string[];
  /** The block appended to the reply. Null when there was nothing to say. */
  note: string | null;
};

/** Sentence-ish spans, keeping their terminator so the reply reads normally. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
}

/**
 * Check the chat's own reply for a manual-workaround suggestion.
 *
 * Deliberately takes no facts and no tool result: this is about the
 * SHAPE of the sentence, not about whether the underlying action was
 * possible. A reply that hands over content is wrong even when the
 * tool genuinely cannot do the job — the honest answer there is to say
 * so, which `PREREQUISITE` leaves alone.
 */
export function checkReplyWorkarounds(reply: string): WorkaroundCheck {
  const text = reply ?? "";
  if (!text.trim()) return { reply: text, withheld: [], note: null };

  const { masked, restore } = maskQuotes(text);
  const kept: string[] = [];
  const withheld: string[] = [];

  for (const sentence of sentences(masked)) {
    const excused = PREREQUISITE.some((re) => re.test(sentence)) || HAWLAI_IS_ACTING.some((re) => re.test(sentence));
    const isHandover = !excused && HANDOVER.some((re) => re.test(sentence));
    if (isHandover) withheld.push(restore(sentence).trim());
    else kept.push(sentence);
  }

  if (withheld.length === 0) return { reply: text, withheld: [], note: null };

  const rebuilt = restore(kept.join(" ")).trim();
  return {
    // EVERYTHING ELSE SURVIVES. The failure explanation above the
    // handover is usually the useful half, and deleting the whole
    // reply would leave the owner with nothing.
    reply: rebuilt || text,
    withheld,
    note: workaroundNote(withheld.length),
  };
}

/**
 * What the owner reads instead.
 *
 * It does NOT say what was withheld word for word. Reprinting the copy
 * underneath a note explaining that it must not be handed over would
 * hand it over.
 */
export function workaroundNote(count: number): string {
  return `

I started to suggest you do that by hand, and I've held that back — ${
    count === 1 ? "it" : "they"
  } would have gone around the approval step, so there'd be no preview, no record of the change and nothing to undo. The step didn't go through and nothing was saved. Want me to try again, or leave it?`;
}
