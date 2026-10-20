// Turning the owner's recorded rows into citable facts.
//
// PLAN-FACT-BOUND-GENERATION §2.2 and §9.1 step 1. This is the FIRST
// deliverable of the pivot, and deliberately the one with no generation
// change: it takes rows that have already been fetched, returns facts
// and readings, calls no model, writes nothing, and moves no row.
//
// NOTHING IS MOVED OUT OF `business_story`. Not one update. For the
// live business all 14 recorded rows sit under that category and nine
// hold the product facts; the per-sentence table in
// docs/PLAN-AGENCY.md A.4a is confirmed by the owner before anything
// changes category, and this module reads whatever is there today.
//
// THREE FILTERS, ALL ALREADY WRITTEN AND REUSED RATHER THAN REBUILT:
//
//   personalStories.splitStories   a customer's private situation is
//                                  not marketing material, and one of
//                                  these rows is a real customer whose
//                                  husband was in an accident
//   storyRows.isStoryRow           the three titles the founder
//                                  classified as STORY
//   storyRows.factSentences        the owner's reason-and-feeling
//                                  sentences, dropped from the rows
//                                  that stay — row 10's motive is a
//                                  health-claim seed
//
// So a fact reaching this function's output has already survived the
// private filter, the story filter and the motive filter.

import { splitStories } from "@/lib/claims/personalStories";
import { isStoryRow, factSentences } from "@/lib/content/storyRows";
import { classifySentence, isReportedBelief, type SentenceKind } from "./sentenceKind";
import { readingsFor, type Reading } from "./readings";
import { assertUniqueIds, factId, licensesFor, type FactRecord } from "./factRecord";

export type KnowledgeRow = {
  id?: string | null;
  category?: string | null;
  title?: string | null;
  content?: string | null;
};

/** One sentence, classified, with whatever facts it produced. */
export type ExtractedSentence = {
  rowId: string;
  rowTitle: string;
  text: string;
  kind: SentenceKind;
  /** The typed readings, each of which became a record. */
  readings: Reading[];
  /** Every record this sentence produced — typed, or the statement itself. */
  factIds: string[];
};

export type Extraction = {
  records: FactRecord[];
  sentences: ExtractedSentence[];
  /** Rows held back whole, and why — so the owner can see what was skipped. */
  /**
   * Everything that produced no record, with the reason.
   *
   * "question" and "cta" were ADDED 2026-10-20. Until then a sentence
   * the classifier called either one minted nothing and appeared in no
   * list at all, so it left no trace anywhere — which is how three
   * misclassified owner facts sat in the eval fixtures unnoticed.
   */
  skipped: { rowTitle: string; reason: "private" | "story" | "empty" | "question" | "cta" }[];
  /** Sentences dropped as the owner's motive rather than a fact. */
  droppedMotive: { rowTitle: string; text: string }[];
  /** Sentences dropped because they report someone else's belief, usually to correct it. */
  droppedBelief: { rowTitle: string; text: string }[];
};

/**
 * Facts from recorded rows.
 *
 * `owner_stated`, `observed`, every time — a row is the owner telling
 * us something, which is not the same as our own rows counting it. A
 * typed READING of a Hinglish sentence drops further to `inferred`,
 * because reading is where we can be wrong, and an inferred record is
 * shown to the owner before it licenses anything.
 */
export function extractFromKnowledge(dealershipId: string, rows: KnowledgeRow[] | null | undefined): Extraction {
  const records: FactRecord[] = [];
  const sentences: ExtractedSentence[] = [];
  const skipped: Extraction["skipped"] = [];
  const droppedMotive: Extraction["droppedMotive"] = [];
  const droppedBelief: Extraction["droppedBelief"] = [];
  const observedAt = new Date().toISOString();

  // A customer's private story is removed before anything else looks at
  // it. Not filtered later, not filtered "mostly" — first.
  const { usable, withheld } = splitStories(
    (rows ?? []).map((r) => ({ category: r.category ?? "", title: r.title ?? "", content: r.content ?? "" }))
  );
  for (const w of withheld) skipped.push({ rowTitle: String((w as any).title ?? ""), reason: "private" });

  for (const row of usable as unknown as KnowledgeRow[]) {
    const rowTitle = String(row.title ?? "").trim();
    const rowId = String(row.id ?? rowTitle);

    if (isStoryRow(rowTitle)) {
      skipped.push({ rowTitle, reason: "story" });
      continue;
    }

    const { kept, dropped } = factSentences(row.content);
    for (const d of dropped) droppedMotive.push({ rowTitle, text: d });
    if (!kept.length) {
      skipped.push({ rowTitle, reason: "empty" });
      continue;
    }

    for (const text of kept) {
      // SOMEONE ELSE'S BELIEF IS NOT A FACT ABOUT THE PRODUCT.
      //
      // "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota
      // hai." — the first sentence is the misconception this row exists
      // to correct, and reading it as a fact minted
      // `product.burn_hours = 10` beside the true 40. A row denying a
      // false claim became the evidence for it. Found by the
      // owner-confirmation table before anything cited these records.
      if (isReportedBelief(text)) {
        droppedBelief.push({ rowTitle, text });
        continue;
      }
      const kind = classifySentence(text);
      const sourceRef = `business_knowledge:${rowId}`;
      const readings = kind === "factual" ? readingsFor(text) : [];
      const ids: string[] = [];

      for (const r of readings) {
        const id = factId(dealershipId, `${sourceRef}#${r.key}`, text);
        ids.push(id);
        records.push({
          id,
          dealershipId,
          key: r.key,
          value: r.value,
          unit: r.unit ?? null,
          source: "owner_stated",
          sourceRef,
          // A READING, not a quote: this is where we can be wrong.
          confidence: "inferred",
          licenses: licensesFor("owner_stated"),
          recordedText: text,
          observedAt,
        });
      }

      // A factual sentence we could not type still becomes a record, so
      // it can be cited. It licenses `existence` only — a restatement
      // of what the owner said — and never a number, because the number
      // is exactly the part we failed to read.
      // AND THE SAME FOR A SENTENCE THE CLASSIFIER DID NOT CALL
      // FACTUAL, which is the bigger half of this and was invisible
      // until 2026-10-20.
      //
      // THE ASYMMETRY WAS REASONED ABOUT IN ONE DIRECTION ONLY.
      // sentenceKind's own header says "when in doubt: factual",
      // because in the VERIFICATION direction calling a factual
      // sentence `feeling` lets an unsupported claim through with no
      // citation. True. But the same function runs in the EXTRACTION
      // direction, where calling a factual sentence `feeling` means the
      // owner's recorded fact NEVER BECOMES A RECORD AT ALL — and
      // nothing was written down about that.
      //
      // Three of the eval fixtures' ten owner rows were landing on the
      // wrong side of it, each for a missing Hinglish verb form:
      //
      //   "Products Korea se aate hain."           the cue list has
      //                                            se aata, se aati,
      //                                            not se aate
      //   "Peanut oil kitchen mein nahi aata."     the refusal list has
      //                                            nahi karti/karta/
      //                                            karte, not nahi aata
      //   "Har batch mein maximum twelve students." a spelled-out
      //                                            quantity needs a
      //                                            UNIT, and "students"
      //                                            is a product noun
      //                                            that rule 3 rightly
      //                                            bars from the
      //                                            classifier
      //
      // A recorded batch size, a recorded refusal about peanut oil in a
      // kitchen, and a recorded supplier country. All three read as
      // sentences the model had invented, because the record they
      // should have cited did not exist.
      //
      // I AM NOT CHASING CONJUGATIONS. That is B10 — a word list
      // defeated by the next form — and the classifier has been patched
      // for Hinglish gaps twice already. The structural answer is that
      // the FALLBACK should not depend on the classifier being right:
      // every sentence the owner wrote that is not a question, not a
      // call to action and not someone else's reported belief becomes a
      // citable statement, licensed for `existence` only.
      //
      // That is safe in the one direction it has to be. `existence` on
      // a quoted sentence licenses nothing numeric, the judge still has
      // to find that the words state the claim, and the words are the
      // OWNER'S — so the worst case is that a business can cite
      // something it wrote down itself, which is the whole point of the
      // record layer.
      const quotable = kind === "factual" ? !readings.length : kind === "feeling";
      if (quotable) {
        const id = factId(dealershipId, `${sourceRef}#statement`, text);
        ids.push(id);
        records.push({
          id,
          dealershipId,
          key: `statement.${slug(text)}`,
          value: text,
          unit: null,
          source: "owner_stated",
          sourceRef,
          // Quoted, not interpreted — so this one is `observed`.
          confidence: "observed",
          // EXISTENCE ONLY, and it stays that way.
          //
          // The S1 exit run of 2026-10-16 lost a true sentence here:
          // the dairy's row "Haath se churn karte hain" was kept only
          // as prose, so a `process` claim resting on it was refused at
          // selection, Select reached for a coarser record, and the
          // judge then refused "hand-churned" for not being in it.
          //
          // My first fix widened this line to licensesFor("owner_stated").
          // tests/factExtractor.test.ts pins ["existence"] and it is
          // RIGHT to: an unparsed sentence is quoted, not understood,
          // and a claim should not rest on words nothing has read. The
          // answer was to make the fact TYPED instead — readings.ts now
          // reads "haath se churn" as process.hand_churned, which gets
          // the full owner_stated licences like every other typed
          // reading. No test was changed.
          licenses: ["existence"],
          recordedText: text,
          observedAt,
        });
      }

      // NOTHING LEAVES WITHOUT AN ACCOUNT OF ITSELF.
      //
      // Before this, a sentence the classifier called `cta` or
      // `question` minted no record and appeared in NO list — not
      // skipped, not droppedMotive, not droppedBelief. It simply
      // vanished, and that is why a misclassified fact could sit in
      // three fixtures for weeks without anybody noticing. F-01 in the
      // record layer: silence read as nothing-to-see.
      if (!ids.length) skipped.push({ rowTitle, reason: kind === "question" ? "question" : "cta" });

      sentences.push({ rowId, rowTitle, text, kind, readings, factIds: ids });
    }
  }

  // A collision means two facts share a citation, so one could license
  // the other. That is a bug in the id scheme, not data to work around.
  assertUniqueIds(records);
  return { records, sentences, skipped, droppedMotive, droppedBelief };
}

/** A short, stable key fragment from a sentence. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .slice(0, 4)
    .join("_")
    .slice(0, 40);
}

/**
 * The table the owner confirms, once.
 *
 * Every typed reading, with the sentence it came from and the words that
 * produced it. Only `inferred` readings need confirming — a quoted
 * statement is the owner's own sentence and needs no sign-off.
 *
 * Returned as data rather than printed, so the same function serves the
 * script, a test and, later, a settings screen.
 */
export function readingsToConfirm(extraction: Extraction): {
  rowTitle: string;
  sentence: string;
  key: string;
  value: string | number | boolean;
  unit: string | null;
  because: string;
  factId: string;
}[] {
  const out: ReturnType<typeof readingsToConfirm> = [];
  for (const s of extraction.sentences) {
    for (const r of s.readings) {
      const rec = extraction.records.find((x) => x.key === r.key && x.recordedText === s.text);
      if (!rec || rec.confidence !== "inferred") continue;
      out.push({
        rowTitle: s.rowTitle,
        sentence: s.text,
        key: r.key,
        value: r.value,
        unit: r.unit ?? null,
        because: r.because,
        factId: rec.id,
      });
    }
  }
  return out;
}
