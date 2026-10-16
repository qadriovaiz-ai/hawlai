// THE THIRTEEN THE REVIEWER FOUND, AND THE GATE DID NOT.
//
// Graded from the S1 exit run of 16 October 2026: unsupported claims
// sitting in drafts with NO mark. The reviewer's list, verbatim, with
// his case ids — not my reading of the output. That distinction earned
// its keep: my own guess had four sentences, missed the dairy-04 pair
// entirely, and filed dairy-07 under the wrong shape.
//
// This is the known-missed set the second gate measures against. A fix
// is worth nothing until the extractor enumerates these.

export type MissedSentence = {
  caseId: string;
  text: string;
  /** Which failure class, as diagnosed in docs/PLAN-CORE-ARCHITECTURE.md §4c. */
  klass: "A1" | "A2" | "B";
  /** What the claim actually is, in plain English. For the report. */
  claim: string;
  /** True when the same sentence appears twice in the piece (subject and body). */
  duplicate?: boolean;
};

/**
 * A1 — a CLAUSE riding on a true fact, joined by a dash, `kyunki`,
 *      `aur` or `isliye`. The true half is why the vague half travels.
 * A2 — a MODIFIER inside the noun phrase, doing claim work with no
 *      clause of its own. "pure" is not a clause, and the clause-aware
 *      fix I first planned would have sailed straight past it.
 * B  — the records-unreadable case, which never entered the pipeline:
 *      `Boolean(req.facts)` in factBoundEnabled sent it down the old
 *      path. Six of the thirteen.
 */
export const MISSED_BY_GATE: MissedSentence[] = [
  // candle-05 — a true recorded fact, with a flourish bolted on
  { caseId: "candle-05", klass: "A1", claim: "the difference is visible", text: "Yahan har cheez thodi slowly, thodi carefully banti hai — aur wahi fark dikhta hai." },
  { caseId: "candle-05", klass: "A1", claim: "no shortcuts are taken on quality", text: "Fragrance sirf 65 celsius pe dala jata hai — kyunki quality mein koi shortcuts nahi" },
  { caseId: "candle-05", klass: "A1", claim: "the difference is visible", duplicate: true, text: "Yahan har cheez thodi carefully banti hai — aur wahi fark dikhta hai." },

  // candle-08 — records unreadable, and the old path wrote anyway
  { caseId: "candle-08", klass: "B", claim: "the candle gives 20 minutes of quiet", text: "Woh woh 20 minute hain jab ghar thoda quieter, thoda softer lagta hai." },
  { caseId: "candle-08", klass: "B", claim: "every candle is hand-poured", text: "Har pour haath se kiya gaya hai — machine nahi, care hai" },
  { caseId: "candle-08", klass: "B", claim: "the scent is subtle and not overwhelming", text: "Scent itna subtle hai ki room mein ghuste hi feel hota hai, overwhelm nahi" },
  { caseId: "candle-08", klass: "B", claim: "the candle gives 20 minutes of quiet", duplicate: true, text: "Woh woh 20 minute hain jab ghar thoda quieter, thoda softer lagta hai." },
  { caseId: "candle-08", klass: "B", claim: "burn it two hours the first time so the wax pool reaches the edge", text: "Ek kaam karo pehli baar jalaane se pehle: candle ko 2 ghante tak burn karne do, taaki wax pool poori surface tak ban jaye." },
  { caseId: "candle-08", klass: "B", claim: "the scent comes through better and the candle lasts longer", text: "Isse scent bhi achhi tarah aata hai, aur candle zyada der chalti hai." },

  // salon-05 — a catalogue price, with two claims after the dash
  { caseId: "salon-05", klass: "A1", claim: "it is budget-friendly and the results are real", text: "Keratin treatment sirf ₹3500 mein — budget-friendly, results real" },

  // dairy-04 and dairy-07 — "pure", inside the noun phrase
  { caseId: "dairy-04", klass: "A2", claim: "the ghee is pure", text: "We make pure, hand-churned clarified butter the traditional way — and we're delighted to have you with us." },
  { caseId: "dairy-04", klass: "A2", claim: "the ghee is pure", duplicate: true, text: "We make pure, hand-churned clarified butter the traditional way — and we are delighted to have you with us." },
  { caseId: "dairy-07", klass: "A2", claim: "the ghee is pure", text: "Pure desi ghee, made in Indore, ready for your kitchen." },
];

/** The distinct shapes, with the duplicates folded away. */
export function distinctMissed(): MissedSentence[] {
  return MISSED_BY_GATE.filter((m) => !m.duplicate);
}

export function missedByClass(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MISSED_BY_GATE) out[m.klass] = (out[m.klass] ?? 0) + 1;
  return out;
}
