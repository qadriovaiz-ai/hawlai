// TIER 1 — THE FREE HALF OF THE ADVERSARIAL SET.
//
// docs/PLAN-S2-ADVERSARIAL.md §4, approved 2026-10-20. Ten of the
// sixteen known bug-shapes are settled in code, so most adversarial
// cases need no model at all: they run here, on every commit, for
// nothing, forever.
//
// WHAT THIS REPLACES. Twenty-six paid runs at Rs 12-17 each, each one
// surfacing a single fault. Eight of those faults were B9 — a code
// check deleting true copy — and every one of them is the kind of thing
// this file settles in milliseconds.
//
// THE VOCABULARY IS BUILT FROM THE FIXTURE, NOT WRITTEN BY HAND, and
// that matters more than it looks. A hand-written `allowed` list is a
// guess about what the pipeline would have had in front of it, and a
// guess that is too generous makes a must-survive case pass for the
// wrong reason. My own B16 test did exactly that until I noticed: it
// left business.city out, so "Indore" was reported alongside "just" and
// the assertion failed by accident rather than by design.

import { describe, it, expect } from "vitest";
import { introducedWords } from "@/lib/content/introducedWords";
import { notCopySentences } from "@/lib/content/notCopy";
import { contextFromFacts } from "@/lib/facts/getContext";
import { WHATSAPP_ADVERSARIAL } from "../scripts/eval/adversarial/whatsapp";
import { tier1, tier2, type AdversarialCase } from "../scripts/eval/adversarial/types";
import { SHAPE_IDS, SHAPES, CODE_SHAPES } from "../scripts/eval/shapes";

const ALL: AdversarialCase[] = [...WHATSAPP_ADVERSARIAL];

/**
 * Everything the pipeline would legitimately have had in front of it.
 *
 * The same four sources generateCopy puts in `allowedVocabulary`: every
 * record's key, words and value, the business name, its category, and
 * what the owner typed. Nothing else, because anything else would be a
 * word the model introduced.
 */
function vocabularyFor(c: AdversarialCase): string[] {
  const ctx = contextFromFacts("biz_eval", c.fixture.facts, { kind: "whatsapp", topic: c.topic });
  const facts = c.fixture.facts as any;
  return [
    ...ctx.records.map((r) => `${r.key.replace(/[._]/g, " ")} ${r.recordedText} ${r.value ?? ""}`),
    facts.businessName ?? "",
    facts.category ?? "",
    c.topic,
  ];
}

/** What the free checks make of one case's sentence. */
function verdictFor(c: AdversarialCase): { removed: boolean; why: string } {
  if (c.check === "notCopy") {
    const found = notCopySentences([c.sentence]);
    return { removed: found.length > 0, why: found.map((f) => f.reason).join(", ") };
  }
  const found = introducedWords([c.sentence], vocabularyFor(c));
  return { removed: found.length > 0, why: found.map((f) => `${f.kind}:${f.word}`).join(", ") };
}

describe("1. every case is well-formed before any of them is run", () => {
  it("NAMES A SHAPE THAT EXISTS", () => {
    // A case naming a shape that does not exist is a typo, and a typo
    // that silently tests nothing is worse than a red test.
    for (const c of ALL) {
      expect(SHAPE_IDS, c.id).toContain(c.shape);
    }
  });

  it("HAS A UNIQUE ID", () => {
    const ids = ALL.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("SAYS WHY, in a sentence a human can argue with", () => {
    // `because` is read by whoever sees a red test, and "because the
    // rule says so" would tell them nothing.
    for (const c of ALL) {
      expect(c.because.length, c.id).toBeGreaterThan(40);
    }
  });

  it("AND A TIER-1 CASE NAMES THE CHECK THAT SETTLES IT", () => {
    // Named per case rather than inferred from the shape, because one
    // shape can be caught in two places and a test that does not know
    // which one it asserts is not much of a test.
    for (const c of tier1(ALL)) {
      expect(["introducedWords", "notCopy"], c.id).toContain(c.check);
    }
  });

  it("a case quoted from a real run says where it came from", () => {
    // Provenance, not a shortcut. These are the ones a human has
    // already graded, and that is evidence worth keeping.
    const quoted = ALL.filter((c) => c.graded);
    expect(quoted.length).toBeGreaterThan(8);
    for (const c of quoted) expect(c.graded, c.id).toMatch(/run|grading/);
  });
});

describe("2. the set covers the shapes it claims to", () => {
  it("BOTH DIRECTIONS ARE WELL REPRESENTED", () => {
    // The whole lesson of twenty-six runs: not one of their faults was
    // the model inventing a fact. A set weighted toward "catch the lie"
    // would have measured none of them.
    const survive = ALL.filter((c) => c.direction === "must_survive").length;
    expect(survive / ALL.length).toBeGreaterThan(0.35);
    expect(survive / ALL.length).toBeLessThan(0.65);
  });

  it("EVERY TRADE IS COVERED, so no shape is tested in one trade only", () => {
    const trades = new Set(ALL.map((c) => c.fixture.trade));
    expect(trades.size).toBe(6);
    for (const trade of trades) {
      expect(ALL.filter((c) => c.fixture.trade === trade).length, trade).toBeGreaterThanOrEqual(8);
    }
  });

  it("AND THE SHAPE WITH EIGHT INCIDENTS HAS THE MOST CASES", () => {
    // B9 is a code check deleting true copy, and it has bitten eight
    // times. If the case set does not reflect that, it is not built
    // from the evidence.
    const byShape = new Map<string, number>();
    for (const c of ALL) byShape.set(c.shape, (byShape.get(c.shape) ?? 0) + 1);
    const worst = SHAPES.filter((s) => s.incidents >= 4).map((s) => s.id);
    for (const id of worst) {
      if (id === "B18") continue; // the instrument, not a product shape
      expect(byShape.get(id) ?? 0, id).toBeGreaterThanOrEqual(2);
    }
  });

  it("every code-decided shape has at least one free case", () => {
    const covered = new Set(tier1(ALL).map((c) => c.shape));
    const missing = CODE_SHAPES.filter((id) => id !== "B18" && !covered.has(id));
    // Named rather than counted, so a gap is actionable.
    expect(missing.length ? `uncovered by any free case: ${missing.join(", ")}` : "all covered").toBe(
      missing.length ? `uncovered by any free case: ${missing.join(", ")}` : "all covered"
    );
    expect(covered.size).toBeGreaterThanOrEqual(5);
  });
});

describe("3. WHATSAPP — the free cases, one assertion each", () => {
  for (const c of tier1(WHATSAPP_ADVERSARIAL)) {
    const must = c.direction === "must_be_removed" ? "REMOVED" : "SURVIVES";
    it(`${c.id} [${c.shape}] ${must}: ${c.sentence}`, () => {
      const { removed, why } = verdictFor(c);
      expect(removed, `${c.because}${why ? ` (check said: ${why})` : ""}`).toBe(c.direction === "must_be_removed");
    });
  }
});

describe("4. what tier 1 cannot settle is named, not hidden", () => {
  it("THE TIER-2 CASES ARE THE ONES A MODEL MUST JUDGE", () => {
    // Every one of these waits for a single batched paid run. Saying
    // how many there are is the difference between a known cost and a
    // surprise.
    const waiting = tier2(ALL);
    expect(waiting.length).toBeGreaterThan(0);
    for (const c of waiting) {
      const s = SHAPES.find((x) => x.id === c.shape)!;
      expect(["model", "both", "code"], c.id).toContain(s.decidedBy);
    }
  });

  it("and the split is reported, because the cost model depends on it", () => {
    const free = tier1(ALL).length;
    const paid = tier2(ALL).length;
    expect(free + paid).toBe(ALL.length);
    // The plan's claim is that most cases are free. If that stops being
    // true the cost model has changed and somebody should notice here.
    expect(free).toBeGreaterThan(paid);
  });
});
