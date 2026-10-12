// SHIPPING TRUTH COMES FROM CHECKOUT, AND NO TEXT MAY OVERRIDE IT.
//
// THE LIVE EVENT (2026-10-11) was not a failure. candle_by_qaaf's
// shipping is set to "Always Free" in Website Builder, the owner chose
// it, and the welcome email's "free shipping" was TRUE and correctly
// licensed. My first diagnosis blamed site text licensing the phrase
// and was wrong: the licence came from the store's shipping settings,
// which is the design working.
//
// THE LATENT BUG FOUND BESIDE IT was real. The check read:
//
//     if (freeShipping && !said(freeShipping[0])) { … }
//
// and `!said(...)` short-circuited the whole block. Any occurrence of
// "free shipping" in knownText — the About page, a product
// description, an owner-entered fact — skipped the flat-rate refusal
// below it. So a FLAT RATE store whose own text mentioned free
// shipping could advertise it everywhere while checkout charged at the
// till: copy and checkout disagreeing, with the customer finding out
// last.
//
// Both directions are pinned here, because a fix that only refuses is
// half a fix — the second test is the live case and it must keep
// passing.

import { describe, it, expect } from "vitest";
import { stripUnsupported } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/**
 * A store with the shipping mode under test, and "free shipping"
 * present in its OWN site text — which is what used to buy the skip.
 */
function store(
  shipping: BusinessFacts["shipping"],
  siteSaysFreeShipping: boolean
): BusinessFacts {
  const paragraphs = siteSaysFreeShipping
    ? ["We offer free shipping on every order.", "Soy wax candles from Shahjahanpur."]
    : ["Soy wax candles from Shahjahanpur."];
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 999, description: "Soy wax, 40 hour burn", images: [] }],
    offers: [],
    pillars: [],
    site: {
      url: "/site/candle-by-qaaf",
      published: true,
      pages: [{ slug: "home", title: "Home", pageType: "home", headings: ["Candle by Qaaf"], paragraphs, buttons: [], metaDescription: null, hasShareImage: false }],
    } as any,
    home: { slug: "home", title: "Home", pageType: "home", headings: ["Candle by Qaaf"], paragraphs, buttons: [], metaDescription: null, hasShareImage: false } as any,
    links: { store: "/site/candle-by-qaaf", booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping,
    unreadable: [],
  } as unknown as BusinessFacts;
}

const SENTENCE = "Free shipping on every order.";

describe("a FLAT RATE store may not say it, whatever its own text says", () => {
  it("IT IS REFUSED EVEN WITH 'free shipping' ON THE ABOUT PAGE", () => {
    // The exact bug: the site text used to buy a skip past this check.
    const r = stripUnsupported(SENTENCE, store({ mode: "flat", rate: 60, freeThreshold: null }, true), "publish");
    expect(r.text.trim()).toBe("");
    expect(r.removed.join(" ")).toMatch(/free shipping/i);
  });

  it("AND THE REASON NAMES THE REAL SHIPPING, so the owner can see the mismatch", () => {
    const r = stripUnsupported(SENTENCE, store({ mode: "flat", rate: 60, freeThreshold: null }, true), "publish");
    expect(r.removed.join(" ")).toMatch(/60/);
  });

  it("refused with no site mention either — the baseline that already worked", () => {
    const r = stripUnsupported(SENTENCE, store({ mode: "flat", rate: 60, freeThreshold: null }, false), "publish");
    expect(r.text.trim()).toBe("");
  });

  it("REFUSED IN DRAFT MODE TOO — a price the customer is charged is not a draft warning", () => {
    const r = stripUnsupported(SENTENCE, store({ mode: "flat", rate: 60, freeThreshold: null }, true), "draft");
    expect(r.text.trim()).toBe("");
  });
});

describe("an ALWAYS FREE store may say it — the live case", () => {
  it("IT SURVIVES UNTOUCHED", () => {
    // candle_by_qaaf, 2026-10-11. If this ever fails, the fix has
    // over-corrected and an honest store has been silenced.
    const r = stripUnsupported(SENTENCE, store({ mode: "free", rate: null, freeThreshold: null }, false), "publish");
    expect(r.text.trim()).toBe(SENTENCE);
    expect(r.removed).toEqual([]);
  });

  it("and in draft mode", () => {
    const r = stripUnsupported(SENTENCE, store({ mode: "free", rate: null, freeThreshold: null }, false), "draft");
    expect(r.text.trim()).toBe(SENTENCE);
  });

  it("other phrasings of the same true thing also survive", () => {
    const free = store({ mode: "free", rate: null, freeThreshold: null }, false);
    for (const s of ["Shipping is free.", "No delivery charges.", "Ships free across India."]) {
      expect(stripUnsupported(s, free, "publish").text.trim(), s).toBe(s);
    }
  });
});

describe("free-above-X keeps its existing rule", () => {
  // THE FIXTURE MATTERS HERE, and my first version of it was wrong.
  //
  // The rule is decided on the CHEAPEST product: if even that one
  // qualifies for free shipping, "free shipping on every order" is
  // true for every order, and the check correctly allows it. My first
  // fixture priced the only product at 999 against a 999 threshold -
  // so every order DID ship free, the claim was true, and the test
  // failed for the right reason. The code was right and the test was
  // wrong.
  //
  // So the cheapest product has to sit BELOW the threshold for the
  // bare claim to be false.
  const below = (f: BusinessFacts): BusinessFacts =>
    ({ ...f, products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn", images: [] }] } as unknown as BusinessFacts);
  const aboveStore = below(store({ mode: "free_above", rate: 60, freeThreshold: 999 }, false));

  it("A ₹999 CHEAPEST PRODUCT MAKES THE BARE CLAIM TRUE — the case that corrected my fixture", () => {
    // Threshold 999, cheapest product 999: every order qualifies, so
    // the unqualified sentence is honest and must survive.
    const everyOrderFree = store({ mode: "free_above", rate: 60, freeThreshold: 999 }, false);
    expect(stripUnsupported(SENTENCE, everyOrderFree, "publish").text.trim()).toBe(SENTENCE);
  });

  it("NAMING THE THRESHOLD IS ALLOWED", () => {
    const s = "Free shipping above ₹999.";
    expect(stripUnsupported(s, aboveStore, "publish").text.trim()).toBe(s);
  });

  it("AND SAYING IT BARE IS NOT", () => {
    // The customer below the threshold pays, so the bare claim is false
    // for them. This rule predates the fix and must survive it.
    expect(stripUnsupported(SENTENCE, aboveStore, "publish").text.trim()).toBe("");
  });

  it("the threshold claim is not licensed by site text either", () => {
    const withText = below(store({ mode: "free_above", rate: 60, freeThreshold: 999 }, true));
    expect(stripUnsupported(SENTENCE, withText, "publish").text.trim()).toBe("");
  });
});

describe("a services-only business has nothing to ship", () => {
  it("IT IS REFUSED, with that as the reason", () => {
    const services = {
      ...store({ mode: "flat", rate: 60, freeThreshold: null }, false),
      products: [{ name: "Candle workshop", price: 800, description: "Ninety minutes", images: [], kind: "service" }],
    } as unknown as BusinessFacts;
    const r = stripUnsupported(SENTENCE, services, "publish");
    expect(r.text.trim()).toBe("");
    expect(r.removed.join(" ")).toMatch(/nothing is shipped/i);
  });
});
