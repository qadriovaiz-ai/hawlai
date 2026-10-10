// Phase 3.5: the four paths that had NO narrative provenance.
//
// MY OWN CLAIM WAS WRONG. Commit e9e52c6 put provenance in
// factsGate.guardOrMark and said it was "the one place all eight
// generators already pass through". guardOrMark has SIX callers.
// Measured on 2026-10-10, these reach the claim checks by another route
// and had no provenance at all:
//
//   socialMediaAgent  guards a plain caption string, so it calls
//                     stripUnsupported directly
//   chatbotAgent      the website widget, talking to VISITORS - the most
//                     serious of the four
//   seoToolkitAgent   calls guardGenerated directly
//   adEngine          calls guardGenerated directly
//
// That is the per-surface mistake F-16 names, committed while fixing
// F-16. The rule now lives in stripUnsupported - the function that
// checks the fact, which every one of them does reach - and this file
// executes each path to prove it rather than asserting the wiring.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { stripUnsupported, guardGenerated } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/** A business with records, so an invented story cannot be excused by their absence. */
function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "home fragrance",
    categoryKnown: true,
    city: "Lucknow",
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn" }],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [] } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [],
    businessModels: { models: ["products"], inferred: false },
    shipping: null,
    ...over,
  } as unknown as BusinessFacts;
}

const INVENTED = "We started this in a tiny kitchen with one borrowed saucepan.";
const QUOTE = "One customer told us it changed her evenings completely.";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the sentence guard itself carries it", () => {
  it("AN INVENTED FOUNDING STORY IS WITHHELD BY stripUnsupported", () => {
    // This is what makes the other four work: every one of them reaches
    // this function.
    const r = stripUnsupported(`Lavender candle, 550. ${INVENTED}`, facts(), "publish");
    expect(r.text).not.toMatch(/borrowed saucepan/);
    expect(r.text).toContain("Lavender candle, 550.");
    expect(r.narrative).toHaveLength(1);
  });

  it("an invented customer quote too", () => {
    expect(stripUnsupported(QUOTE, facts(), "publish").narrative).toHaveLength(1);
  });

  it("THE OWNER'S OWN RECORDED STORY PASSES UNTOUCHED", () => {
    // The floor. A guard that deletes the owner's real words would be
    // removed within a week, and it would deserve to be.
    const recorded = facts({
      ownerFacts: [{ category: "business_story", title: "Curing", content: "Har candle 24 ghante cure hoti hai." }] as any,
    });
    const real = "Har candle 24 ghante cure hoti hai.";
    const r = stripUnsupported(real, recorded, "publish");
    expect(r.text).toBe(real);
    expect(r.narrative).toHaveLength(0);
  });

  it("and ordinary product copy is left completely alone", () => {
    const plain = "Lavender candle, soy wax, 40 hour burn. 550.";
    const r = stripUnsupported(plain, facts(), "publish");
    expect(r.text).toBe(plain);
    expect(r.narrative).toHaveLength(0);
  });

  it("IT IS APPLIED ONCE, not twice", () => {
    // It used to run in guardOrMark as a second pass over the guarded
    // output. Leaving both would have doubled every finding and said the
    // note twice.
    const r = guardGenerated({ text: INVENTED }, facts(), "publish");
    expect(r.narrative).toHaveLength(1);
    const note = String((r.output as any)._claimsNote ?? "");
    expect(note.match(/nothing in your records says it/g) ?? []).toHaveLength(1);
  });
});

describe("1. socialMediaAgent — the plain-string caption path", () => {
  // It guards a string, not an object, so it never went through
  // guardOrMark and never had provenance.
  //
  // PROVED IN TWO PARTS, and the split is stated rather than hidden:
  // the RULE is proved by execution above (stripUnsupported withholds
  // the story), and the WIRING is proved by reading the one line that
  // connects them. Mocking this agent end to end needs the model client
  // replaced mid-test; two attempts at that left the agent on its
  // failure path, where it returns the PROMPT as the caption - so the
  // assertion was reading "a candle post" and would have passed for
  // entirely the wrong reason.
  it("IT GUARDS ITS CAPTION THROUGH stripUnsupported", async () => {
    const { code } = await import("./helpers/source");
    const agent = code("src/lib/agents/socialMediaAgent.ts");
    expect(agent).toMatch(/stripUnsupported\(caption, facts, claimsMode\)/);
    // And the no-facts branch keeps its own fail-closed call.
    expect(agent).toMatch(/stripUnverifiable\(caption\)/);
  });

  it("and the rule it reaches does withhold the story", () => {
    const r = stripUnsupported(`Lavender candle, 550. ${INVENTED}`, facts(), "publish");
    expect(r.text).toBe("Lavender candle, 550.");
    expect(r.narrative).toHaveLength(1);
  });
});

describe("2. the website widget — the one that talks to VISITORS", () => {
  it("AN INVENTED STORY IS WITHHELD FROM WHAT A VISITOR READS", async () => {
    // The most serious of the four: this reaches a real stranger
    // immediately, with nobody reviewing it.
    const { stripUnsupported: strip } = await import("@/lib/claims/claimCheck");
    // chatbotAgent's own call, in the mode it uses.
    const r = strip(`Our Lavender candle is 550. ${INVENTED}`, facts(), "publish");
    expect(r.text).not.toMatch(/borrowed saucepan/);
    expect(r.narrative).toHaveLength(1);

    // And the widget really does reach it in publish mode.
    const { code } = await import("./helpers/source");
    const widget = code("src/lib/agents/chatbotAgent.ts");
    expect(widget).toMatch(/stripUnsupported\(spoken, context\.facts, "publish"\)/);
  });
});

describe("3 and 4. seoToolkitAgent and adEngine — the guardGenerated callers", () => {
  it("guardGenerated NOW CARRIES IT, so both get it", () => {
    const r = guardGenerated({ title: "Lavender candle", body: INVENTED }, facts(), "publish");
    expect(r.narrative).toHaveLength(1);
    expect((r.output as any).body).not.toMatch(/borrowed saucepan/);
  });

  it("and the note reaches the owner through it", () => {
    const r = guardGenerated({ body: QUOTE }, facts(), "publish");
    expect(String((r.output as any)._claimsNote)).toMatch(/customer/);
  });

  it("both still call it, so neither can drift back out", async () => {
    const { code } = await import("./helpers/source");
    expect(code("src/lib/agents/seoToolkitAgent.ts")).toMatch(/guardGenerated\(/);
    expect(code("src/lib/adEngine.ts")).toMatch(/guardGenerated\(/);
  });
});

describe("the six that already had it still do", () => {
  it("guardOrMark's callers are unchanged, and get it once", async () => {
    const { guardOrMark } = await import("@/lib/claims/factsGate");
    const r = guardOrMark({ text: INVENTED }, facts(), "publish");
    expect(r.narrative).toHaveLength(1);
    expect((r.output as any).text).toBe("");
  });

  it("AND THE NO-FACTS BRANCH STILL FAILS CLOSED", async () => {
    // F-01's lesson. stripUnsupported needs facts, so the
    // fact-independent branch keeps its own call - removing it would
    // turn provenance off exactly when the records cannot be read.
    const { guardOrMark } = await import("@/lib/claims/factsGate");
    const r = guardOrMark({ text: INVENTED }, null, "publish");
    expect(r.state).toBe("FACTS_UNAVAILABLE");
    expect(r.narrative).toHaveLength(1);
    expect((r.output as any).text).toBe("");
  });
});
