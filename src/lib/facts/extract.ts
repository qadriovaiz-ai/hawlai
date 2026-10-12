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
  skipped: { rowTitle: string; reason: "private" | "story" | "empty" }[];
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
      if (kind === "factual" && !readings.length) {
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
          licenses: ["existence"],
          recordedText: text,
          observedAt,
        });
      }

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
