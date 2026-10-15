// THE EVAL MUST GIVE THE GENERATOR WHAT THE PRODUCT GIVES IT.
//
// 13 October 2026. The three eval fixtures each carried
// `ownerFacts: []` beside a populated `rows`, so the baseline run
// measured the generators with the Business Knowledge channel
// disconnected — while the grading sheet showed those same rows to
// both human graders. 135 sentences were judged against records the
// generator never received.
//
// Two wrong conclusions came out of that run: an apparent false
// positive on #FSSAILicensed (the owner row licenses it, and the guard
// never saw the row), and a cross-tenant-bleed hypothesis for the
// dairy's "small batches" that could not have been true, because the
// dairy's own rows reached neither the prompt nor the guard.
//
// This pins the fix at the only place that matters: the fixture's
// ownerFacts and its rows are the SAME DATA, in the shape
// businessFacts.ts:225 produces.

import { describe, it, expect } from "vitest";
import { FIXTURES, CANDLE, SALON, DAIRY, withoutFacts } from "../scripts/eval/fixtures";
import { knownText } from "../src/lib/claims/businessFacts";

describe("the eval fixtures' owner knowledge", () => {
  it("EVERY FIXTURE'S ownerFacts IS ITS OWN rows — not empty, not something else", () => {
    expect(FIXTURES.length).toBe(3);
    for (const f of FIXTURES) {
      const owner = (f.facts as any).ownerFacts as { category: string; title: string; content: string }[];
      expect(owner, `${f.key} has no ownerFacts`).toBeTruthy();
      expect(owner.length, `${f.key}: ${owner.length} ownerFacts vs ${f.rows.length} rows`).toBe(f.rows.length);
      expect(owner.map((k) => [k.category, k.title, k.content])).toEqual(
        f.rows.map((r) => [r.category, r.title, r.content])
      );
    }
  });

  it("the rows reach knownText, which is what said() consults", () => {
    // The specific sentence whose absence produced the baseline's one
    // apparent false positive.
    expect(knownText(DAIRY.facts)).toContain("fssai");
    // And one per tenant, so a single lucky substring cannot carry it.
    expect(knownText(CANDLE.facts)).toContain("paraffin");
    expect(knownText(SALON.facts)).toContain("ammonia");
  });

  it("CONSENT IS NEVER GRANTED BY A FIXTURE — personalStories must stay armed", () => {
    // A fixture that set consented: true would switch off the
    // protection on a customer's private situation, and the eval would
    // report that it is safe to publish.
    for (const f of FIXTURES) {
      for (const k of (f.facts as any).ownerFacts as { consented?: boolean }[]) {
        expect(k.consented).toBe(false);
      }
    }
  });

  it("the records-unreadable fixtures stay unreadable", () => {
    // withoutFacts is how the fail-closed cases are built. If the
    // wiring above ever gave it owner rows, candle-08 and salon-09
    // would stop testing anything.
    const blind = withoutFacts(CANDLE);
    expect(blind.facts).toBeNull();
    expect(blind.rows).toEqual([]);
  });

  it("every fixture has rows at all, so the assertion above cannot pass vacuously", () => {
    for (const f of FIXTURES) expect(f.rows.length).toBeGreaterThan(2);
  });
});
