// A customer's private moment is not marketing material.
//
// WHAT IS IN THERE RIGHT NOW. Candle by Qaaf's Business Story includes a
// real customer writing that her husband had been in an accident and she
// lit one of these candles through the hours of waiting at the hospital.
// The owner wrote it down because it moved her. It is the most powerful
// thing in the file and it is not hers to publish.
//
// WHERE IT GOES. formatFactsForCopy puts the Business Story into the
// prompt IN FULL, never truncated, under the heading "use these
// specifics; they are what makes this business different" — and that
// block reaches Content, Email, Paid Ads, Retargeting, WhatsApp, the SEO
// and AEO toolkits, Brand Kit, Research and, since 01d6a44, the website
// builder. An AEO recommendation has already pointed at this story as
// "genuine content" worth putting in front of people.
//
// So a stranger's hospital waiting room was one generate away from an
// Instagram caption, and nothing in the product was going to stop it.
//
// WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT. It withholds a
// story that is about an identifiable third party and a private event
// from generation only. The row is NOT changed, NOT hidden from the
// owner, and NOT removed from the evidence set — if she has written that
// her candles are hand-poured inside that same paragraph, that fact
// still counts. What stops is Hawlai repeating somebody else's grief to
// sell a candle.
//
// It is a floor, not a permission system. Only the owner can say she has
// the customer's consent, and until there is somewhere to record that
// answer the safe default is the one that cannot hurt anybody.

export type StoryFact = {
  category: string;
  title: string;
  content: string;
  /** The owner has confirmed she has that person's permission. */
  consented?: boolean;
};

/** Someone who is not the owner and not the business. */
const THIRD_PARTY = [
  /\b(?:a|one|another|this|my|our)\s+(?:customer|client|buyer|lady|woman|man|girl|boy|guy|friend|neighbour|neighbor|gentleman)\b/i,
  /\b(?:customers?|clients?)\s+(?:ne|ko|ki|ka|told|wrote|said|messaged|asked|shared)\b/i,
  /\bek\s+(?:customer|client|ladki|aurat|mahila|bhai|behen|aunty|uncle)\b/i,
  /\bher\s+(?:husband|wife|son|daughter|mother|father|brother|sister|baby|child)\b/i,
  /\bhis\s+(?:husband|wife|son|daughter|mother|father|brother|sister|baby|child)\b/i,
  /\buske?\s+(?:pati|patni|beta|beti|maa|papa|bhai|behen)\b/i,
  /\bshe\s+(?:wrote|told|said|messaged|shared|sent)\b/i,
  /\bhe\s+(?:wrote|told|said|messaged|shared|sent)\b/i,
  /\bunhone\s+(?:likha|bataya|kaha)\b/i,
];

/**
 * A private event. Medical, bereavement, or a crisis.
 *
 * Narrow on purpose: "she loved it" is a testimonial the owner may well
 * have permission for, and withholding every mention of a customer
 * would gut a small business's story. What is withheld is the kind of
 * detail a person would be distressed to find in an advert.
 */
const PRIVATE_EVENT = [
  /\b(?:accident|crash|hospital|hospitalised|hospitalized|icu|surgery|operation|ventilator|emergency)\b/i,
  /\b(?:cancer|chemo|tumour|tumor|stroke|heart\s+attack|diagnos(?:is|ed)|illness|terminally)\b/i,
  /\b(?:died|death|passed\s+away|funeral|cremation|bereave|widow|miscarriage|stillborn)\b/i,
  /\b(?:divorce|separation|breakup|broke\s+up|depression|anxiety\s+attack|panic\s+attack|suicide|self[- ]harm)\b/i,
  /\b(?:pregnan|labour\s+ward|nicu|infertility|ivf)\b/i,
  /\b(?:accident|aspataal|hospital)\s+(?:mein|me)\b/i,
  /\b(?:beemar|bimaar|guzar\s+gaye|intezaar\s+ki\s+raat)\b/i,
];

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Why this story may not be used in public copy, or null.
 *
 * Both halves are required: a third party AND a private event. One alone
 * is ordinary. "A customer ordered six for Diwali" is a fact about the
 * business; "my own hospital stay taught me…" is the owner's story to
 * tell, and hers to decide about.
 */
export function withheldFromCopy(fact: StoryFact): string | null {
  const text = `${fact.title ?? ""} ${fact.content ?? ""}`;
  if (!text.trim()) return null;
  if (!matches(THIRD_PARTY, text)) return null;
  if (!matches(PRIVATE_EVENT, text)) return null;
  // THE OWNER HAS ANSWERED THE QUESTION. Only she can: it is the
  // customer's permission, not Hawlai's to infer, and not something a
  // pattern can establish. Set by her alone, on the row itself
  // (business_knowledge.public_use_consent, default false).
  if (fact.consented === true) return null;
  return "it tells someone else's private situation, and only you can say whether they agreed to it being used in your marketing";
}

/**
 * Whether this row is the KIND that needs consent, consent aside.
 *
 * What the Business Knowledge page asks the question on. Separate from
 * withheldFromCopy so the toggle appears on a row she has already
 * agreed to — otherwise saying yes would make the control vanish and
 * there would be no way back.
 */
export function needsConsent(fact: StoryFact): boolean {
  const text = `${fact.title ?? ""} ${fact.content ?? ""}`;
  return Boolean(text.trim()) && matches(THIRD_PARTY, text) && matches(PRIVATE_EVENT, text);
}

export type SplitStories = {
  /** Safe to write from. */
  usable: StoryFact[];
  /** Withheld, with the reason, for the prompt to be told about explicitly. */
  withheld: { fact: StoryFact; reason: string }[];
};

export function splitStories(facts: StoryFact[]): SplitStories {
  const usable: StoryFact[] = [];
  const withheld: { fact: StoryFact; reason: string }[] = [];
  for (const fact of facts) {
    const reason = withheldFromCopy(fact);
    if (reason) withheld.push({ fact, reason });
    else usable.push(fact);
  }
  return { usable, withheld };
}

/**
 * What the prompt is told about a story it may not use.
 *
 * NAMED RATHER THAN SILENTLY DROPPED. A model that cannot see a story
 * will sometimes invent one to fill the same gap — "a customer once told
 * us…" — which is worse: an invented customer anecdote is a fabricated
 * testimonial. So it is told that the material exists, that it is
 * off-limits, and not to reach for a substitute.
 */
export function withheldNote(withheld: SplitStories["withheld"]): string {
  if (withheld.length === 0) return "";
  return [
    `WITHHELD FROM YOU ON PURPOSE: ${withheld.length} ${withheld.length === 1 ? "entry" : "entries"} in this owner's Business Story ${withheld.length === 1 ? "describes" : "describe"} a customer's private situation (illness, bereavement, an accident or similar).`,
    "You may NOT use, quote, paraphrase, allude to or build a scene from any customer's personal circumstances, and you must NOT invent a substitute anecdote to fill the gap — an invented customer story is a fabricated testimonial.",
    "Write from the products, the craft, the place and the occasion instead. If the owner asks you to use a customer's story, say that you need her to confirm she has that customer's permission first.",
  ].join(" ");
}
