// A "STARTING FROM" PRICE IS A CLAIM ABOUT THE CHEAPEST THING, AND IT
// WAS NOT BEING CHECKED AT ALL.
//
// Reviewer-graded F in the baseline run of 13 October 2026, candle-03:
//
//   "Dono ₹850 se shuru hoti hain, aur delivery free hai har order pe."
//
// The Lavender candle is ₹999 and the Rose is ₹850, so "both start from
// ₹850" is false of the Lavender. It passed every price check in this
// file, and the reason is worth recording: the existing rule asks "is
// this amount a real amount ANYWHERE on record" (realAmounts +
// isRealAmount, claimCheck.ts:816-824). ₹850 is a real amount — of the
// other product. A price can be real and still be the wrong price.
//
// Two shapes are checked here, and only two, because both are false
// whatever product the sentence turns out to be about:
//
//   DISTRIBUTIVE  "dono/both/all/every ... from ₹X" asserts X of EACH
//                 product, so it is true only if they all cost X.
//   BELOW THE FLOOR  "from ₹X" where X is less than the cheapest thing
//                 on record: nothing costs that little, so no reading
//                 of the sentence is true.
//
// Deliberately NOT flagged: "from ₹999" when something cheaper exists.
// That is a true statement about one product, and the sentence may well
// name it.

import { describe, it, expect } from "vitest";
import { findUnsupportedClaims, stripUnsupported } from "@/lib/claims/claimCheck";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

function facts(prices: number[]): BusinessFacts {
  return {
    businessName: "A Business",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Shahjahanpur",
    site: null,
    home: null,
    products: prices.map((price, i) => ({
      id: `p${i}`, name: `Candle ${i}`, kind: "product", price,
      description: null, images: [], inventory: null, category: null, active: true,
    })),
    offers: [],
    shipping: { mode: "free", rate: null, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [],
    brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: null, products: [], booking: null },
    season: seasonFor([], "2026-09-18"),
    unreadable: [],
  } as unknown as BusinessFacts;
}

const TWO = facts([999, 850]);

describe('a "starting from" price', () => {
  it('CATCHES THE LIVE SENTENCE: "Dono ₹850 se shuru hoti hain" when one candle is ₹999', () => {
    const found = findUnsupportedClaims("Dono ₹850 se shuru hoti hain.", TWO);
    expect(found.join(" ")).toMatch(/850/);
  });

  it("catches the English forms of the same claim", () => {
    for (const s of [
      "Both start from ₹850.",
      "All our candles start at ₹850.",
      "Every candle is ₹850 onwards.",
      "Sabhi candles ₹850 se shuru hoti hain.",
    ]) {
      expect(findUnsupportedClaims(s, TWO), s).not.toEqual([]);
    }
  });

  it("THE BUSINESS'S OWN TEXT CANNOT LICENSE IT — two prices are not one price", () => {
    // `said()` suppresses a flag when the phrase already appears in the
    // business's own site, catalogue or Business Knowledge. That is
    // right for a composition claim the owner stands behind, and wrong
    // here: this is arithmetic against the catalogue, and nothing a
    // business writes about itself can make ₹999 and ₹850 both ₹850.
    //
    // The same loophole, on the comparative rules, is what let "safer
    // than mass-market paraffin" through on 3 October 2026 — the About
    // page Hawlai had written became its own evidence.
    const withItOnRecord = {
      ...facts([999, 850]),
      ownerFacts: [{ category: "general", title: "Pricing", content: "Dono ₹850 se shuru hoti hain.", consented: false }],
    } as unknown as BusinessFacts;
    const found = findUnsupportedClaims("Dono ₹850 se shuru hoti hain.", withItOnRecord);
    expect(found.join(" ")).toMatch(/EVERY one of them/);
  });

  it("IS TRUE WHEN EVERY PRODUCT REALLY DOES COST THAT, and is not flagged", () => {
    const same = facts([850, 850]);
    expect(findUnsupportedClaims("Dono ₹850 se shuru hoti hain.", same)).toEqual([]);
    expect(findUnsupportedClaims("Both start from ₹850.", same)).toEqual([]);
  });

  it("catches a floor below the cheapest thing on record, distributive or not", () => {
    // Nothing costs ₹500, so no reading of this sentence is true.
    expect(findUnsupportedClaims("Candles ₹500 se shuru hoti hain.", TWO)).not.toEqual([]);
    expect(findUnsupportedClaims("Prices start at ₹500.", TWO)).not.toEqual([]);
  });

  it('DOES NOT FLAG "from ₹999" — a true statement about one product', () => {
    // The sentence may well be about the Lavender. A rule that
    // demanded the catalogue minimum here would delete a true price,
    // and the false-positive rate is the number this work must protect.
    expect(findUnsupportedClaims("The lavender candle starts at ₹999.", TWO)).toEqual([]);
  });

  it("a plain price with no 'from' is untouched by this rule", () => {
    expect(findUnsupportedClaims("Lavender candle ₹999.", TWO)).toEqual([]);
    expect(findUnsupportedClaims("Rose candle ₹850.", TWO)).toEqual([]);
  });

  it("IT IS A PRICE PROBLEM, so a draft keeps it with a note and publish removes it", () => {
    const s = "Dono ₹850 se shuru hoti hain.";
    const draft = stripUnsupported(s, TWO, "draft");
    expect(draft.text).toContain("850");
    expect(draft.priceWarnings.join(" ")).toMatch(/850/);
    const published = stripUnsupported(s, TWO, "publish");
    expect(published.text).not.toContain("850");
  });

  it("THIS RULE says nothing when there is no catalogue to compare against", () => {
    // Corrected expectation. I first asserted no complaint at all, and
    // that was wrong: with no products on record ₹850 is not a real
    // amount anywhere, so the EXISTING rule flags it, and should. What
    // this rule must not do is claim the catalogue "runs from X to Y"
    // when there is no catalogue — that sentence would be Hawlai's own
    // invented fact about the business.
    const found = findUnsupportedClaims("Dono ₹850 se shuru hoti hain.", facts([]));
    expect(found.join(" ")).toMatch(/no product, service, offer or shipping amount on record/);
    expect(found.join(" ")).not.toMatch(/EVERY one of them/);
    expect(found.join(" ")).not.toMatch(/the catalogue runs from/);
  });

  it("and says nothing when the business has exactly one product", () => {
    // "Both start from ₹850" with one product on record is a claim
    // about a second product nothing knows about. The amount rule owns
    // that; comparing a one-item catalogue to itself would always pass
    // and would read as a verification that did not happen.
    const one = facts([850]);
    const found = findUnsupportedClaims("Dono ₹850 se shuru hoti hain.", one);
    expect(found.join(" ")).not.toMatch(/EVERY one of them/);
  });
});
