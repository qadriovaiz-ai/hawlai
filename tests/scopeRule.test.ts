// A CLAIM ABOUT ONE PRODUCT NEEDS A RECORD ABOUT THAT PRODUCT.
//
// Founder's rule, 16 October 2026, reversing his own earlier reading.
// The S1 exit run removed "This product contains no ammonia" twice,
// because the only record was `material.ammonia = false` from "Ammonia
// wale products use nahi karte" — the business's PRACTICE. I reported
// those as wrongly removed. He corrected me: the judge was right.
//
// A business-level negative does not establish a particular item's
// composition, however true the business-level statement is. The salon
// may well use ammonia-free products for the keratin and something else
// for a colour service; nothing on record says which, so the sentence
// is not supported.
//
// Three places carry the rule, because it is enforced at three
// different moments: Select must not pick such a claim, the judge must
// not entail it, and the human grader must not mark it T.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { contextFromFacts } from "@/lib/facts/getContext";
import { gradingSheet, type GradedSentence } from "../scripts/eval/harness";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

describe("the scope rule is written where it is enforced", () => {
  it("SELECT IS TOLD NOT TO PICK A BUSINESS-LEVEL RECORD FOR A PRODUCT CLAIM", () => {
    const src = code("src/lib/facts/selectClaims.ts");
    expect(src).toMatch(/A CLAIM ABOUT ONE NAMED PRODUCT OR SERVICE NEEDS A RECORD ABOUT THAT PRODUCT OR SERVICE/);
    // And told what to do instead, or it will stretch the general fact.
    expect(src).toMatch(/that is an UNKNOWN: ask the owner to record it against the item/);
    expect(src).toMatch(/Do not stretch the general fact to cover the particular one/);
  });

  it("THE JUDGE IS TOLD THE SAME, IN BOTH DIRECTIONS", () => {
    const src = code("src/lib/facts/verifyClaims.ts");
    expect(src).toMatch(/SCOPE\. A claim about ONE named product or service must be supported by a fact about THAT product or service/);
    expect(src).toMatch(/however true that general fact is/);
    // The reverse too: one item's fact does not cover all of them.
    expect(src).toMatch(/a fact about one item does not support a claim about all of them/);
  });

  it("THE GRADER IS TOLD THAT THIS PATTERN IS U OR F, NEVER T", () => {
    const row: GradedSentence = {
      caseId: "c-01", fixture: "A Business", trade: "services", scenario: "complete_facts",
      surface: "email", field: "body", sentence: "This treatment contains no ammonia.",
      kind: "factual", availableFacts: ["material.ammonia = false"], removedByGuard: [], watch: "scope",
    };
    const sheet = gradingSheet([row], "reviewer");
    expect(sheet).toMatch(/SCOPE RULE \(founder, 16 October 2026\)/);
    expect(sheet).toMatch(/general business fact → specific product claim/);
    expect(sheet).toMatch(/\*\*U or\nF, never T\*\*|\*\*U or F, never T\*\*/);
  });
});

function facts(products: any[]): BusinessFacts {
  return {
    businessName: "A Business", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: null, home: null, products, offers: [],
    shipping: { mode: "free", rate: null, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [{ category: "general", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." }],
    brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: null, products: [], booking: null },
    season: seasonFor([], "2026-09-18"), unreadable: [],
  } as unknown as BusinessFacts;
}

const product = (name: string, description: string | null) => ({
  id: name.toLowerCase().replace(/\W+/g, "_"), name, kind: "product", price: 999,
  description, images: [], inventory: null, category: null, active: true, durationMinutes: null, bookingUrl: null,
});

describe("the rule is workable: product-level evidence exists", () => {
  it("THE CATALOGUE DESCRIPTION BECOMES A PRODUCT-SCOPED RECORD", () => {
    // Without this, the rule would ALSO refuse "the lavender candle is
    // soy wax" — true, recorded, and the only record for it being the
    // business-level row. The description column was sitting unused and
    // is exactly the product-level evidence the rule asks for.
    const ctx = contextFromFacts("biz", facts([product("Lavender candle", "Soy wax, 40 hour burn")]), {
      kind: "email",
      topic: "welcome email for the lavender candle",
    });
    const d = ctx.records.find((r) => r.key === "product.lavender_candle.description");
    expect(d?.value).toBe("Soy wax, 40 hour burn");
    expect(d?.source).toBe("catalogue");
    // Quoted from a column, not measured, and not a reading of a
    // sentence: `observed` is the right confidence.
    expect(d?.confidence).toBe("observed");
    // The record's own words name the product, so the judge can see the
    // scope rather than infer it.
    expect(d?.recordedText).toMatch(/^Lavender candle: /);
  });

  it("a product with no description mints no description record", () => {
    const ctx = contextFromFacts("biz", facts([product("Plain candle", null)]), { kind: "email", topic: "a welcome email" });
    expect(ctx.records.some((r) => r.key.endsWith(".description"))).toBe(false);
  });

  it("the business-level reading is still there, and still business-level", () => {
    // Both exist. The point of the rule is that they are different
    // kinds of evidence, not that one replaces the other.
    const ctx = contextFromFacts("biz", facts([product("Lavender candle", "Soy wax, 40 hour burn")]), { kind: "email", topic: "a welcome email" });
    expect(ctx.records.some((r) => r.key === "material.paraffin")).toBe(true);
    expect(ctx.records.some((r) => r.key === "product.lavender_candle.description")).toBe(true);
  });
});
