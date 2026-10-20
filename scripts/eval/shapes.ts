// THE KNOWN BUG-SHAPES, AS DATA.
//
// docs/PLAN-S2-ADVERSARIAL.md §1, approved by the founder 2026-10-20.
// Sixteen product shapes drawn from the commit record of twenty-six
// paid runs, plus one that spoils the evidence rather than the copy.
//
// WHY THEY ARE DATA AND NOT PROSE. Every adversarial case has to name
// the shape it targets, and a case naming a shape that does not exist
// is a typo rather than a test. More importantly: a shape with no cases
// is a shape nobody is testing, and that is invisible until it is
// written down somewhere a test can count.
//
// WHO DECIDES EACH ONE. `decidedBy` is the honest cost model behind the
// whole plan: "code" means a free test that runs on every commit,
// "model" means a paid call. Ten of the sixteen are code, which is why
// roughly two hundred of the two hundred and eighty cases cost nothing.

export type ShapeId =
  | "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "B8"
  | "B9" | "B10" | "B11" | "B12" | "B13" | "B14" | "B16" | "B17"
  | "B18";

export type Shape = {
  id: ShapeId;
  /** Short enough to read in a test failure. */
  name: string;
  /** What goes wrong, in one sentence. */
  fault: string;
  /** Which layer settles a case of this shape. */
  decidedBy: "code" | "model" | "both";
  /** The run or date that produced it, so the claim can be checked. */
  firstSeen: string;
  /** How many separate times it has bitten. */
  incidents: number;
};

export const SHAPES: Shape[] = [
  {
    id: "B1",
    name: "the licence does not match what the record is",
    fault: "A claim type demands a licence the record's source cannot grant, so a true recorded fact is unsayable.",
    decidedBy: "code",
    firstSeen: "S1, 16 Oct — the candle's 40-hour burn",
    incidents: 3,
  },
  {
    id: "B2",
    name: "a type that cannot say there is none",
    fault: "A required field with nothing to put in it gets a placeholder, which downstream reads as a contradicting value.",
    decidedBy: "code",
    firstSeen: "S1 — a boolean stringified to \"false\"",
    incidents: 2,
  },
  {
    id: "B3",
    name: "scope applied in the wrong direction",
    fault: "A collective reference read as one product, a product record read as the range, or store policy refused for both.",
    decidedBy: "code",
    firstSeen: "S1 runs 4-6",
    incidents: 5,
  },
  {
    id: "B4",
    name: "the judge is shown a paraphrase",
    fault: "The evidence put in front of the judge is a model's summary rather than the owner's own words.",
    decidedBy: "model",
    firstSeen: "S1 — the Select model's intent shown as evidence",
    incidents: 2,
  },
  {
    id: "B5",
    name: "a check measured against text a model wrote",
    fault: "The model marks its own work: its own prose is in the vocabulary the check compares against.",
    decidedBy: "code",
    firstSeen: "S1 — c.intent in allowedVocabulary",
    incidents: 2,
  },
  {
    id: "B6",
    name: "a figure checked against the wrong authority",
    fault: "A figure compared with the approved claims but never with the records, or with a value that holds prose.",
    decidedBy: "code",
    firstSeen: "S2a run 4 — 250 inside the name \"Paneer 250g\"",
    incidents: 3,
  },
  {
    id: "B7",
    name: "claim typing",
    fault: "The right rule applied to the wrong type. The licence table is only as strong as the type the model picks.",
    decidedBy: "model",
    firstSeen: "S1 — ammonia typed as safety",
    incidents: 5,
  },
  {
    id: "B8",
    name: "curation mistaken for gatekeeping",
    fault: "A true recorded fact refused because Select did not choose it for this piece.",
    decidedBy: "both",
    firstSeen: "S2a run 12 — \"The paneer is fresh.\"",
    incidents: 2,
  },
  {
    id: "B9",
    name: "a code check over-firing on legitimate copy",
    fault: "A guard deletes true or harmless text. The dominant failure mode of this whole initiative.",
    decidedBy: "code",
    firstSeen: "S1 — \"We never use cheap paraffin wax\" emptied",
    incidents: 8,
  },
  {
    id: "B10",
    name: "a word list pretending to be a rule",
    fault: "A rule written as surface forms, defeated by the next rephrasing.",
    decidedBy: "code",
    firstSeen: "S1 — \"pure\" fixed three times after \"asli\" and \"premium\"",
    incidents: 4,
  },
  {
    id: "B11",
    name: "recall failure in context",
    fault: "A rule that holds on a specimen and fails in a real message. No retry fixes it: temperature is 0.",
    decidedBy: "model",
    firstSeen: "S2a runs 6-10 — salon-04's benefit claim",
    incidents: 4,
  },
  {
    id: "B12",
    name: "something that is not copy at all",
    fault: "A placeholder, a note or the model's own questions in the field that goes to the customer.",
    decidedBy: "code",
    firstSeen: "S2a run 6 — \"[LICENSE NUMBER NEEDED]\"",
    incidents: 3,
  },
  {
    id: "B13",
    name: "silence read as approval",
    fault: "An empty, failed or skipped check treated as a pass. Everything must fail closed, including the pipeline's account of itself.",
    decidedBy: "code",
    firstSeen: "F-01, September — facts ? guard() : skip",
    incidents: 5,
  },
  {
    id: "B14",
    name: "the copy changes after the checks have run",
    fault: "A retry replaces verified copy with new model output that nothing then looks at.",
    decidedBy: "code",
    firstSeen: "S2a run 11 — \"Order now -> [link]\"",
    incidents: 1,
  },
  {
    id: "B16",
    name: "a word that makes a figure sound small",
    fault: "The mirror of B10: a minimiser asserts the amount is little, which no record says.",
    decidedBy: "code",
    firstSeen: "S2a run 14 — \"just Rs 50\", the founder's blind grading",
    incidents: 1,
  },
  {
    id: "B17",
    name: "two true records read as a third fact",
    fault: "Two records, each true, added together to establish something neither states.",
    decidedBy: "model",
    firstSeen: "S2a run 14 — a city plus a rate read as a delivery area",
    incidents: 1,
  },
  {
    id: "B18",
    name: "the instrument tells a false story",
    fault: "The measurement is wrong in a way that produces a confident, incorrect conclusion. Costs evidence, not copy.",
    decidedBy: "code",
    firstSeen: "the first recall gate, measuring sentences the pipeline never sent",
    incidents: 6,
  },
];

export const SHAPE_IDS = SHAPES.map((s) => s.id);

export function shape(id: ShapeId): Shape {
  const found = SHAPES.find((s) => s.id === id);
  // A case naming a shape that does not exist is a typo, and it should
  // stop the suite rather than quietly test nothing.
  if (!found) throw new Error(`unknown bug-shape: ${id}`);
  return found;
}

/**
 * The shapes a free test can settle.
 *
 * THE COST MODEL OF THE WHOLE PLAN IS THIS LIST. The founder asked for
 * a Rs 2-4 gate over 280 cases and the true figure for model-testing
 * all of them is about Rs 28 — but ten of the sixteen shapes never need
 * a model at all, so most cases become tests that run for nothing,
 * forever, on every commit.
 */
export const CODE_SHAPES = SHAPES.filter((s) => s.decidedBy !== "model").map((s) => s.id);
