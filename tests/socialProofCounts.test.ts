// A fake review count is social proof a stranger acts on.
//
// "We have over 500 five-star reviews" was caught by NOTHING — not with
// facts, not without — while "500 reviews" and "1,000+ happy reviews"
// were both refused. `reviews` was already in NOUNS and the bare form
// worked. The hole was the modifier group between the number and the
// noun: a fixed allowlist of six phrasings, optional but ANCHORED, so
// any unlisted adjective broke the whole match.
//
// The fix is a FAMILY of praise words repeated up to twice, not
// arbitrary words — and the last block here is why.

import { describe, it, expect } from "vitest";
import { findUnsupportedClaims, stripUnverifiable } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/** A business with three real orders and five leads on record. */
function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Test Business",
    category: "home fragrance",
    categoryKnown: true,
    city: "Lucknow",
    products: [{ name: "Lavender jar", price: 450 }],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: null, booking: null, products: [] },
    brand: {} as any,
    last30: { views: 10, chatOpens: 1, leads: 2, orders: 1, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 3, leads: 5 },
    ownerFacts: [],
    businessModels: { models: [], inferred: false },
    shipping: null,
    ...over,
  } as unknown as BusinessFacts;
}

const flags = (text: string) => findUnsupportedClaims(text, facts());

describe("the four cases that were asked for", () => {
  it("500 five-star reviews", () => {
    // The one that was invisible: "five-star" spelled out was not in the
    // six-phrasing allowlist, so the anchored group failed and the whole
    // pattern missed.
    expect(flags("We have over 500 five-star reviews.")).not.toEqual([]);
    expect(flags("We have over 500 five-star reviews.")[0]).toMatch(/3 paid order/);
  });

  it("over 200 5-star ratings", () => {
    // ALREADY WORKED before the change — "5-star" was one of the six.
    // Kept so a future tidy-up of the family cannot quietly lose it.
    expect(flags("over 200 5-star ratings")).not.toEqual([]);
  });

  it("1,000+ happy reviews", () => {
    // Also already worked. The comma and the + both have to survive.
    expect(flags("1,000+ happy reviews")).not.toEqual([]);
  });

  it("rated 4.9 by 300 customers", () => {
    // Two separate rules fire here: the count, and the star rating.
    const r = flags("rated 4.9 by 300 customers");
    expect(r.join(" ")).toMatch(/300 customers/);
    expect(r.join(" ")).toMatch(/star rating/);
  });
});

describe("the two more I found while testing", () => {
  it("500 genuine reviews", () => {
    expect(flags("500 genuine reviews")).not.toEqual([]);
  });

  it("500 glowing reviews", () => {
    expect(flags("500 glowing reviews")).not.toEqual([]);
  });

  it("TWO praise words stacked", () => {
    // "500 genuine five-star reviews" needs the family to repeat.
    expect(flags("500 genuine five-star reviews")).not.toEqual([]);
  });

  it("four-star, not just five", () => {
    expect(flags("200 four-star ratings")).not.toEqual([]);
  });

  it("the bare form still works", () => {
    // It always did. A regression here would be the worst outcome of
    // this change.
    expect(flags("500 reviews")).not.toEqual([]);
  });
});

describe("WHY NOT ARBITRARY WORDS — the false positive that decided it", () => {
  it("FLAT 500 OFF ON ORDERS ABOVE 2000 IS NOT A CLAIM OF 500 ORDERS", () => {
    // Measured, not guessed. `(?:[a-z-]+\s+){0,2}` — which UNITS_SOLD
    // does use — would make this match as a social-proof count, because
    // "off on" is two words between the number and "orders". It is the
    // commonest sentence in Indian retail, and the money rules already
    // read it correctly. A second rule inventing a count from it would
    // be a false positive on honest discount copy.
    const r = flags("Flat 500 off on orders above 2000");
    expect(r.filter((x) => /paid order\(s\)/.test(x))).toEqual([]);
  });

  it("a true count within the record is not flagged", () => {
    // The business HAS 3 paid orders and 5 leads.
    expect(flags("3 paid orders")).toEqual([]);
    expect(flags("5 leads")).toEqual([]);
    expect(flags("2 happy customers")).toEqual([]);
  });

  it("and the number still has to be bigger than the record to flag", () => {
    // Not "every number near a noun is a lie" — the rule compares.
    expect(flags("3 reviews")).toEqual([]);
    expect(flags("400 reviews")).not.toEqual([]);
  });
});

describe("with no facts at all", () => {
  it("A REVIEW COUNT IS UNSUPPORTED BY DEFINITION", () => {
    // F-01's subset: with nothing readable, a count claim cannot be
    // excused, because the records are what would have excused it.
    expect(stripUnverifiable("500 five-star reviews").removed).not.toEqual([]);
    expect(stripUnverifiable("500 genuine reviews").removed).not.toEqual([]);
  });

  it("and the discount line is still left alone", () => {
    // Fail-closed must not mean fail-everything.
    const r = stripUnverifiable("Flat 500 off on orders above 2000");
    expect(r.removed.filter((x) => /customer or review count/.test(x))).toEqual([]);
  });
});
