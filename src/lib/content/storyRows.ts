// Which recorded rows may enter a generation prompt, and which may not.
//
// FOUNDER'S RULE (2026-10-11): the owner's story does not go into
// customer copy. Facts do.
//
// WHY THIS IS AN INPUT FILTER AND NOT A NEW CLAIM RULE. The 11 October
// welcome email carried a founder-story line, and the reason is in the
// prompt rather than in the output: formatFactsForCopy injects the
// recorded story IN FULL under the words "use these specifics". The
// model did as it was told. Removing the instruction is cheaper and
// more certain than policing what it produces.
//
// WHY NOT JUST DELETE THAT BLOCK. Because for the live business all 14
// recorded rows are filed under `business_story`, and nine of them hold
// the PRODUCT FACTS — the double-boiler step, the fragrance timing, the
// 24-hour set, "paraffin-free, soy wax only". businessFacts.ts filters
// `category !== STORY_CATEGORY` out of the facts branch, so that block
// is the only path those facts have into the prompt. Deleting it would
// blind the model to everything true about the product. (docs/
// PLAN-AGENCY.md A.4, where I had recommended exactly that and was
// wrong.)
//
// ---------------------------------------------------------------------
// THIS DELIBERATELY DOES NOT SHARE `ownerVoice.OWNER_VOICE`, and the
// reason matters, because this codebase's convention is one list.
//
// OWNER_VOICE feeds narrativeProvenance, which STRIPS OUTPUT. This file
// filters INPUT. The two have opposite risk profiles:
//
//   stripping output   a false positive DELETES an owner's honest
//                      sentence from copy they are about to publish.
//                      Tune narrow.
//   filtering input    a false positive means the model is not shown a
//                      fact. The copy reads more generic, the
//                      genericness note says so, and nothing false is
//                      published. Tune WIDE.
//
// One list tuned for both would be wrong for both. ownerVoice.ts's own
// header argues for a single list where the QUESTION is the same; here
// the question is the same and the COST is inverted, which is the one
// case that justifies two.
// ---------------------------------------------------------------------

/**
 * Titles the founder classified as STORY on 2026-10-11, confirmed
 * against all 14 rows.
 *
 * Matched on the title because the intake wrote them (`STORY_QUESTIONS`
 * in src/lib/business/businessStory.ts), so they are deterministic.
 * Compared loosely — lowercased, punctuation-insensitive — because an
 * owner may have edited a title by hand.
 */
export const STORY_TITLES = [
  "how it started",
  "the first customers",
  "how you talk about the work",
];

function titleKey(title: string | null | undefined): string {
  return String(title ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** True when this whole row is the owner's story and belongs in no prompt. */
export function isStoryRow(title: string | null | undefined): boolean {
  const key = titleKey(title);
  if (!key) return false;
  // ONE DIRECTION ONLY, and an existing test caught why.
  //
  // The first version also matched when the TITLE started with the key,
  // so a row titled just "How" — whose content is "Hand-poured in small
  // batches. Paraffin-free, soy wax only." — matched "how it started"
  // and its facts were held back from the prompt.
  // tests/customerStoryConsent.test.ts went red on it. That is the
  // blinding mistake this module's own header warns about, made by the
  // matcher rather than by the plan.
  //
  // So: an exact title, or a title that EXTENDS one ("How it started,
  // 2019"). Never a title that is merely a prefix of one.
  return STORY_TITLES.some((t) => key === t || key.startsWith(`${t} `) || key.startsWith(`${t},`));
}

/**
 * A sentence that gives the owner's REASON or FEELING rather than a
 * fact about the product.
 *
 * THE SENTENCE THAT FORCED THIS, from row 10 ("Materials and
 * suppliers", classified FACT):
 *
 *   "Lavender isliye choose ki kyunki kaam ke baad khud stressed
 *    rehti thi…"
 *
 * It is a HEALTH-CLAIM SEED. A model that reads it reaches for "stress
 * relief", and "sleep better" is already on the live-failure list from
 * exactly this kind of input. The rest of that row holds real material
 * facts, so the row is kept and this sentence is dropped — which is why
 * the unit here is the sentence and not the row.
 *
 * TARGETED AT MOTIVE, NOT AT FIRST PERSON, and that distinction is the
 * whole design. "kabhi sasta paraffin wax mix nahi karti" is first
 * person AND a fact the owner stands behind, so it stays. "Har candle
 * 24 ghante set hoti hai" is third person and obviously stays. What is
 * dropped is a reason joined to a feeling.
 *
 * NO `\b` NEAR THE DEVANAGARI RANGES. JS word boundaries are defined
 * over [A-Za-z0-9_] and do not work on Devanagari; that mistake has
 * cost this codebase four separate incidents, three of them in one day.
 */
const MOTIVE: RegExp[] = [
  // A reason connective in the same sentence as a first-person feeling.
  // Hinglish: "isliye … kyunki … stressed/thak/pareshan/sukoon".
  /\b(?:isliye|kyunki|kyun\s?ki|iss?\s+liye)\b[^.!?]{0,80}(?:stress|thak|thaki|thaka|pareshan|sukoon|chain|akela|dukh|khushi|pasand)/i,
  /(?:stress|thak|thaki|thaka|pareshan|sukoon|chain|dukh|khushi)[^.!?]{0,80}\b(?:isliye|kyunki|kyun\s?ki)\b/i,
  // English: "I chose X because I was…", "I started it since I felt…".
  /\b(?:i|we)\s+(?:chose|picked|started|began|switched|made)\b[^.!?]{0,60}\b(?:because|since|as)\b[^.!?]{0,60}\b(?:i|we|my|our|me|us)\b/i,
  /\b(?:because|since)\s+(?:i|we)\s+(?:was|were|felt|wanted|needed|loved|hated|couldn'?t|could\s+not)\b/i,
  // The owner's own feeling, stated directly, in either language.
  /\b(?:i|we)\s+(?:felt|feel|love|loved|hate|hated|wanted|needed|missed|struggled|worried)\b/i,
  /\b(?:mujhe|mujhko)\b[^.!?]{0,40}(?:pasand|acha|achha|lagta|lagti|laga|lagi)\b/i,
  /\b(?:mera|meri|mere)\b[^.!?]{0,30}(?:sapna|shauk|khayal|iraada|irada)\b/i,
  // First-person habitual feeling: "khud stressed rehti thi",
  // "main thak jaati thi".
  /\b(?:khud|main|maine)\b[^.!?]{0,40}(?:stress|thak|pareshan|rehti\s+thi|rehta\s+tha|jaati\s+thi|jaata\s+tha)/i,
  // Devanagari: a reason connective beside a feeling word. No \b.
  /(?:इसलिए|क्योंकि)[^।.!?]{0,80}(?:तनाव|थक|परेशान|सुकून|खुशी)/,
];

/** True when this sentence is the owner's reason or feeling. */
export function isMotiveSentence(sentence: string): boolean {
  const s = String(sentence ?? "");
  return MOTIVE.some((re) => re.test(s));
}

/**
 * Split a recorded row's content into what a prompt may use and what it
 * may not.
 *
 * Sentences are kept in order. A row whose every sentence is motive
 * comes back with nothing usable, and the caller drops it — which is
 * the correct outcome for a row that turned out to be all story.
 */
export function factSentences(content: string | null | undefined): { kept: string[]; dropped: string[] } {
  const text = String(content ?? "").trim();
  if (!text) return { kept: [], dropped: [] };
  // Split on sentence ends including the Devanagari danda, keeping the
  // text readable when rejoined.
  const parts = text.split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const p of parts.length ? parts : [text]) {
    (isMotiveSentence(p) ? dropped : kept).push(p);
  }
  return { kept, dropped };
}

export type PromptRow = { category?: string | null; title?: string | null; content?: string | null };

/**
 * The recorded rows a generation prompt may use, story removed.
 *
 * Returns the kept rows with their motive sentences stripped, and a
 * count of what was held back, so the caller can say so rather than
 * silently showing less. A model that cannot see a story will sometimes
 * invent one to fill the same gap — the reasoning `withheldNote`
 * already applies to a customer's private story.
 */
export function rowsForPrompt(
  rows: PromptRow[] | null | undefined,
  opts: { maxChars?: number } = {}
): {
  rows: { title: string; content: string }[];
  storyRowsHeld: number;
  motiveSentencesHeld: number;
  rowsHeldForSpace: number;
} {
  const out: { title: string; content: string }[] = [];
  let storyRowsHeld = 0;
  let motiveSentencesHeld = 0;
  let rowsHeldForSpace = 0;
  // A BUDGET IN CHARACTERS, NOT A TRUNCATION.
  //
  // Added 2026-10-15, when this function took over the rows that used
  // to be cut at `content.slice(0, 200)`. That cut landed mid-sentence
  // and mid-word, which is how a fact becomes a different fact: "40
  // hours burn hota hai" cut in the wrong place is a number with no
  // unit. So a row is emitted WHOLE or not at all, and the ones that do
  // not fit are counted rather than silently dropped — the caller says
  // how many, because a model that cannot see something will sometimes
  // invent its own version to fill the gap.
  const budget = opts.maxChars ?? Number.POSITIVE_INFINITY;
  let spent = 0;

  for (const row of rows ?? []) {
    if (isStoryRow(row?.title)) {
      storyRowsHeld += 1;
      continue;
    }
    const { kept, dropped } = factSentences(row?.content);
    motiveSentencesHeld += dropped.length;
    if (!kept.length) continue;
    const title = String(row?.title ?? "").trim();
    const content = kept.join(" ");
    // `out.length` so the FIRST row always prints: a single row longer
    // than the whole budget must not produce an empty fact block.
    if (spent + title.length + content.length > budget && out.length) {
      rowsHeldForSpace += 1;
      continue;
    }
    spent += title.length + content.length;
    out.push({ title, content });
  }
  return { rows: out, storyRowsHeld, motiveSentencesHeld, rowsHeldForSpace };
}
