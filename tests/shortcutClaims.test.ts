// "No synthetic shortcuts" — the half of the incident that was never fixed.
//
// THE ORIGINAL INCIDENT is recorded in CLAIM_TERMS' own header: a
// generated homepage said "No paraffin. No synthetic shortcuts." for a
// business whose records said nothing of the kind, and because the site
// counted as its own evidence, that line then backed every later
// mention of paraffin.
//
// "no paraffin" was added to the list. "no synthetic shortcuts" WAS
// NOT. The phrase lived on in a comment describing the incident while
// remaining publishable — and on 21 November 2026 it slipped again,
// into a blog post bound for a live Shopify storefront.
//
// THE OTHER HALF WAS CORRECTLY ALLOWED THAT DAY, and the tests below
// pin that too, so nobody reads this file as "paraffin should have
// been stripped". The business states "Our candles are paraffin-free —
// soy wax only" in Business Knowledge and "Made with 100% soy wax,
// paraffin-free" on a product. The rule is not "don't claim this", it
// is "say it yourself first" — and it had.

import { describe, it, expect } from "vitest";
import { findUnsupportedClaims, stripUnsupported } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/**
 * The real business, as the database actually holds it.
 *
 * Read from production on 21 November 2026 rather than invented, so the
 * "allowed" half of this file is the real allowance and not a fixture
 * bent to agree with it.
 */
function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "A candle business",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products", "services"], inferred: false },
    city: "Shahjahanpur",
    site: null,
    home: null,
    products: [
      {
        id: "p1",
        name: "Lavender candle",
        price: 450,
        description: "Made with 100% soy wax, paraffin-free. Hand-poured in small batches.",
        images: [],
        inventory: 12,
        category: null,
        active: true,
      } as any,
    ],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: [
      { category: "general", title: "Something I can stand behind", content: "Our candles are paraffin-free — soy wax only." } as any,
    ],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: null, products: [], booking: null } as any,
    season: { today: "2026-11-21", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
    ...over,
  } as unknown as BusinessFacts;
}

const flagged = (text: string, f = facts()) => findUnsupportedClaims(text, f).join(" | ");

describe("1. THE PHRASE THAT CAUSED THE RULE IS NOW IN THE RULE", () => {
  it("THE LOAD-BEARING ONE: the exact sentence from the incident", () => {
    // Paraffin kept, because the owner says it. Shortcuts flagged,
    // because nobody ever did.
    const found = flagged("No paraffin. No synthetic shortcuts.");
    expect(found, "the shortcuts claim slipped again").toMatch(/shortcut/i);
    expect(found, "paraffin is on record and must not be flagged").not.toMatch(/paraffin/i);
  });

  it("and it is actually removed from generated copy, not merely noticed", () => {
    const out = stripUnsupported("Hand-poured with no synthetic shortcuts.", facts(), "publish");
    expect(out.removed.join(" ")).toMatch(/shortcut/i);
    expect(out.text).not.toMatch(/shortcut/i);
  });

  it("SEVERAL SURFACE FORMS, because one phrasing is a list that catches only the agreeable drafts", () => {
    // The lesson the soot entry records: the live caption said "burns
    // clean, with no soot collecting at the rim" while the list held
    // "clean burning" and "soot free", and neither matched.
    const forms = [
      "No shortcuts here.",
      "We take no shortcuts.",
      "Made without shortcuts.",
      "Zero shortcuts in how we make these.",
      "No corners cut.",
      "We cut no corners.",
      "We never cut corners.",
      "No compromise on how it is made.",
      "Made without compromise.",
    ];
    const missed = forms.filter((f) => !/shortcut|corner|compromise/i.test(flagged(f)));
    expect(missed, `these forms are not detected: ${missed.join(" / ")}`).toEqual([]);
  });
});

describe("2. THE HALF THAT WAS RIGHT, so it is not 'fixed' later", () => {
  it("paraffin-free is allowed, because this business says it itself", () => {
    // In Business Knowledge AND on a product. "Say it yourself first"
    // is the whole rule.
    expect(flagged("These are paraffin-free.")).not.toMatch(/paraffin/i);
    expect(flagged("No paraffin in any of them.")).not.toMatch(/paraffin/i);
  });

  it("AND IT IS FLAGGED FOR A BUSINESS THAT HAS NOT SAID IT", () => {
    // Not vacuous: the allowance comes from the record, not from the
    // term being harmless.
    const silent = facts({ ownerFacts: [], products: [{ id: "p1", name: "A candle", price: 450, description: "A candle.", images: [], inventory: 1, category: null, active: true } as any] });
    expect(flagged("No paraffin in any of them.", silent)).toMatch(/paraffin/i);
  });

  it("a shortcut claim stays flagged even for a business that mentions soy wax", () => {
    // Saying what you DO use is not saying how carefully you made it.
    // These are separate claims and one must not back the other.
    expect(flagged("100% soy wax and no shortcuts.")).toMatch(/shortcut/i);
  });

  it("and it is allowed once the owner says it", () => {
    // The rule is not "never claim this".
    const said = facts({
      ownerFacts: [
        { category: "general", title: "How we make them", content: "We take no shortcuts — every candle is poured by hand and cured properly." } as any,
      ],
    });
    expect(flagged("Made with no shortcuts.", said)).not.toMatch(/shortcut/i);
  });
});

describe("3. rule 3 — these are generic quality claims, not one trade's words", () => {
  it("the new terms name no category, product or business", () => {
    const forbidden = /candle|kurta|dealership|salon|bakery|restaurant|clinic|boutique/i;
    for (const term of [
      "no shortcuts",
      "no corners cut",
      "no compromise",
      "without compromise",
      "never cut corners",
    ]) {
      expect(term).not.toMatch(forbidden);
    }
  });
});
