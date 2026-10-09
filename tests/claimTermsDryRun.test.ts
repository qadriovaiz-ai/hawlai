// The dry run exists to inform a decision, so it has to be right.
//
// Its first version ignored CLAIM_SYNONYMS and therefore OVERSTATED the
// damage: it reported that a candle maker's honest email — "our handmade
// candles" — would lose its sentence, when that business writes
// "hand-poured" in its own material and the real guard already treats
// those as one claim. Overstating is the worse direction for a script
// whose only job is to help someone decide.
//
// These tests check the script against the REAL guard rather than
// against my description of it.

import { describe, it, expect } from "vitest";
import { wouldFlag, PROPOSED_CLAIM_TERMS } from "../scripts/claimTermsDryRun.mjs";
import { findUnsupportedClaims } from "@/lib/claims/claimCheck";
import { code } from "./helpers/source";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/** A business whose own words say "hand-poured", never "handmade". */
function handPoured(): BusinessFacts {
  return {
    businessName: "Test Candles",
    category: "home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 550, description: "Hand-poured soy wax, 40 hour burn" }],
    offers: [],
    pillars: ["Hand-poured in small batches"],
    site: null,
    home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [] } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: [],
    businessModels: { models: ["products"], inferred: false },
    shipping: null,
  } as unknown as BusinessFacts;
}

describe("the script's synonym assumption matches the real guard", () => {
  it("THE REAL GUARD LICENSES 'handmade' FROM 'hand-poured'", () => {
    // This is the behaviour the script mirrors. If claimCheck ever stops
    // doing it, the script's numbers become wrong in the direction that
    // makes the list look safer than it is.
    const flagged = findUnsupportedClaims("Our handmade candles are poured here.", handPoured());
    expect(flagged.filter((f) => /handmade/i.test(f))).toEqual([]);
  });

  it("and the script agrees, for the same business", () => {
    const known = "Lavender candle. Hand-poured soy wax, 40 hour burn. Hand-poured in small batches.";
    expect(wouldFlag("Our handmade candles are made here.", known)).toEqual([]);
  });

  it("THE NAIVE MODE SHOWS WHAT THE FIRST VERSION GOT WRONG", () => {
    // Kept as a switch rather than deleted, because the gap between the
    // two numbers is the thing worth seeing.
    const known = "Lavender candle. Hand-poured soy wax, 40 hour burn.";
    expect(wouldFlag("Our handmade candles.", known, { synonyms: false })).toContain("handmade");
    expect(wouldFlag("Our handmade candles.", known)).toEqual([]);
  });
});

describe("a claim with nothing behind it is still flagged", () => {
  it("the script does not simply pass everything now", () => {
    // The risk of adding synonyms is over-correcting into a script that
    // reports no damage at all.
    const known = "Lavender candle. Hand-poured soy wax.";
    expect(wouldFlag("Organic, export quality candles.", known)).toEqual(
      expect.arrayContaining(["organic", "export quality"])
    );
  });

  it("a dairy's 'pure ghee' is licensed by its own 'desi ghee'", () => {
    // One fact, two phrasings. Asking the owner to attest both would be
    // the software failing to understand its own question.
    expect(wouldFlag("Pure ghee, 850.", "Desi Ghee 500ml. Bilona method. 850.")).toEqual([]);
  });

  it("but 'A2 milk' is not licensed by anything a ghee listing says", () => {
    expect(wouldFlag("A2 milk paneer.", "Desi Ghee 500ml. Bilona method.")).toContain("a2 milk");
  });
});

describe("the proposed list itself", () => {
  it("SPANS MORE THAN ONE TRADE", () => {
    // The recorded gap in multiTenantVocabulary's allowlist was that
    // CLAIM_TERMS leans toward one category's materials. A replacement
    // that leaned the same way would not be a fix.
    const food = PROPOSED_CLAIM_TERMS.filter((t: string) => /ghee|milk|fssai|preservative|ground|pressed|farm/.test(t));
    const textile = PROPOSED_CLAIM_TERMS.filter((t: string) => /silk|cotton|handloom|khadi|azo|fast/.test(t));
    const crossCategory = PROPOSED_CLAIM_TERMS.filter((t: string) => /organic|handmade|100%|grade|isi|bis|iso|gi tagged/.test(t));
    expect(food.length).toBeGreaterThan(3);
    expect(textile.length).toBeGreaterThan(3);
    expect(crossCategory.length).toBeGreaterThan(3);
  });

  it("names no business and no brand", () => {
    // Rule 3. A claims list is vocabulary, not an example of one shop.
    for (const term of PROPOSED_CLAIM_TERMS) {
      expect(term).not.toMatch(/qaaf|candle|lavender|meena|shree/i);
    }
  });

  it("IS NOT ENABLED — claimCheck's own list is untouched", () => {
    // The whole point of the script. If this ever fails, the dry run
    // stopped being a dry run.
    //
    // code() rather than a raw read, and the enforcement test caught me
    // writing it the other way (rule 8 in CLAUDE.md). It matters here
    // more than usual: claimCheck's comments DISCUSS these very terms —
    // the allowlist note in multiTenantVocabulary mentions widening to
    // ghee, silk and cotton — so a raw read would report the list as
    // enabled on the strength of a comment saying it is not.
    const src = code("src/lib/claims/claimCheck.ts");
    const onlyProposed = ["pure ghee", "a2 milk", "handloom", "khadi", "gi tagged", "azo free"];
    for (const term of onlyProposed) {
      expect(src, `${term} appears in claimCheck but is still only proposed`).not.toContain(`"${term}"`);
    }
  });
});
