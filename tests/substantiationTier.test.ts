// A claim only the OWNER can settle, and what a draft does with it.
//
// Before 2026-10-09 the guard had two tiers. A price was lenient in a
// draft; everything else was removed in both modes. Enabling the widened
// CLAIM_TERMS under those rules would have deleted "pure cotton" from a
// draft — telling a truthful textile shop their own fabric is a lie.
//
// So there is a third tier, and the line is drawn by what the claim is
// ABOUT rather than by how likely it is to be true:
//
//   composition — what the product IS. Only the owner holds this fact;
//                 Hawlai has nothing that contradicts it. A draft keeps
//                 it, names it, and says what to write down.
//   performance — what the product DOES, or is certified as. A customer
//                 will test it. "The candle burns clean, with no soot
//                 collecting at the rim" went out on 8 October 2026, on
//                 the DRAFT path, and that is why these stay strict in
//                 both modes.
//
// Everything here executes the real guard.

import { describe, it, expect } from "vitest";
import { stripUnsupported, guardGenerated, substantiationNote } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/** A textile shop that records "handloom" and nothing about cotton. */
function textile(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Meena Textiles",
    category: "sarees and fabric",
    categoryKnown: true,
    city: "Varanasi",
    products: [
      { name: "Banarasi silk saree", price: 6500, description: "Handloom, zari border" },
      { name: "Cotton kurta fabric", price: 480, description: "2.5m" },
    ],
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

describe("(a) a DRAFT warns about a composition claim, it does not strip it", () => {
  const line = "Cotton kurta fabric, pure cotton, 480.";

  it("THE SENTENCE SURVIVES THE DRAFT", () => {
    const r = stripUnsupported(line, textile(), "draft");
    expect(r.text).toBe(line);
    expect(r.removed).toEqual([]);
  });

  it("and it is REPORTED, not passed off as checked", () => {
    // Keeping it silently would be worse than deleting it.
    const r = stripUnsupported(line, textile(), "draft");
    expect(r.substantiation.join(" ")).toMatch(/pure cotton/);
  });

  it("PUBLISHING STILL REMOVES IT — nobody is reading there", () => {
    const r = stripUnsupported(line, textile(), "publish");
    expect(r.text).toBe("");
    expect(r.removed.join(" ")).toMatch(/pure cotton/);
    expect(r.substantiation).toEqual([]);
  });

  it("the owner's own record licenses it in both modes", () => {
    const records = textile({
      ownerFacts: [{ category: "business_story", title: "Fabric", content: "All our kurta fabric is pure cotton." }] as any,
    });
    expect(stripUnsupported(line, records, "publish").text).toBe(line);
    expect(stripUnsupported(line, records, "draft").substantiation).toEqual([]);
  });
});

describe("(a) the performance tier is NOT lenient, and the live caption proves why", () => {
  it("A DRAFT STILL LOSES 'no soot' AND 'burns clean'", () => {
    // These are the 8 October caption's own words, and it went out on
    // the draft path. A draft-lenient version of this rule would reopen
    // exactly that hole.
    const caption = "The candle burns clean, with no soot collecting at the rim.";
    const r = stripUnsupported(caption, textile(), "draft");
    expect(r.text).toBe("");
    expect(r.substantiation).toEqual([]);
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it("a safety claim is not lenient either", () => {
    expect(stripUnsupported("Non toxic and chemical free.", textile(), "draft").text).toBe("");
  });

  it("A CERTIFICATION IS NOT THE OWNER'S WORDING TO CHOOSE", () => {
    // "certified" and "award winning" are true or false, never a matter
    // of how the owner phrases them.
    expect(stripUnsupported("Award winning sarees.", textile(), "draft").text).toBe("");
  });

  it("A MIXED SENTENCE GOES, even in a draft", () => {
    // Existing precedent, which this tier had to preserve: a true "pure
    // cotton" beside a fabricated count does not rescue the count.
    const r = stripUnsupported("Pure cotton, loved by 500 happy customers.", textile(), "draft");
    expect(r.text).toBe("");
    expect(r.substantiation).toEqual([]);
  });
});

describe("(b) the owner is told what went, why, and what to write", () => {
  it("THE NOTE NAMES THE PHRASE TO RECORD", () => {
    const r = guardGenerated({ text: "Pure cotton kurta fabric, 480." }, textile(), "draft");
    const note = String((r.output as any)._claimsNote ?? "");
    expect(note).toMatch(/pure cotton/);
    // What to write...
    expect(note).toMatch(/write it once/);
    // ...and where.
    expect(note).toMatch(/Business Knowledge|product description/);
  });

  it("it says WHY it was kept, and what publishing will do instead", () => {
    const r = guardGenerated({ text: "Pure cotton kurta fabric." }, textile(), "draft");
    const note = String((r.output as any)._claimsNote ?? "");
    expect(note).toMatch(/reviewing this draft/);
    expect(note).toMatch(/published copy drops/i);
  });

  it("a removed claim and a kept one read as two different things", () => {
    // The owner has to be able to tell "I deleted this" from "I kept
    // this but cannot back it up".
    const r = guardGenerated(
      { text: "Pure cotton fabric. We are India's number 1 saree shop." },
      textile(),
      "draft"
    );
    const note = String((r.output as any)._claimsNote ?? "");
    expect(note).toMatch(/removed/i);
    expect(note).toMatch(/write it once/);
  });

  it("nothing kept, nothing said", () => {
    expect(substantiationNote([])).toBeNull();
  });

  it("the note is singular or plural as it should be", () => {
    expect(substantiationNote(["one thing"])).toMatch(/One claim here isn't/);
    expect(substantiationNote(["a", "b"])).toMatch(/2 claims here aren't/);
  });
});

describe("the word-boundary fix the real suite caught", () => {
  it("'ISI' DOES NOT MATCH INSIDE 'visitors'", () => {
    // The CRO test found this: an honest suggestion reading "13
    // visitors, 0% engagement" was refused as an unsubstantiated ISI
    // certification claim. My own dry run missed it, because no fixture
    // line I invented happened to contain a word like "visitors".
    const r = stripUnsupported("13 visitors, 0% engagement.", textile(), "publish");
    expect(r.removed.join(" ")).not.toMatch(/isi/);
    expect(r.text).toBe("13 visitors, 0% engagement.");
  });

  it("nor inside vision, decision or precision", () => {
    for (const word of ["Our vision is simple.", "A decision you can trust.", "Woven with precision."]) {
      expect(stripUnsupported(word, textile(), "publish").removed.join(" "), word).not.toMatch(/"isi"/);
    }
  });

  it("'BIS' does not match inside 'bistro'", () => {
    expect(stripUnsupported("Next to the bistro on Main Road.", textile(), "publish").removed.join(" ")).not.toMatch(/"bis"/);
  });

  it("BUT THE REAL MARKS ARE STILL CAUGHT", () => {
    // The fix must not have turned the terms off.
    expect(stripUnsupported("ISI marked and BIS approved.", textile(), "publish").removed.length).toBeGreaterThan(0);
  });

  it("AND PLURALS STILL MATCH — the second thing the suite caught", () => {
    // Closing the boundary on every term broke "small batch" against
    // "small batches", on a real Terms page. Substring matching at the
    // tail is what lets one recorded phrasing cover the forms the model
    // actually writes.
    const r = stripUnsupported("Woven in small batches.", textile(), "publish");
    expect(r.removed.join(" ")).toMatch(/small batch/);
  });
});

describe("the two mutations that got through the first pass", () => {
  /** A dairy that records "Desi Ghee" and never writes "pure ghee". */
  const dairy = () =>
    textile({
      businessName: "Shree Dairy",
      category: "dairy and foods",
      city: "Indore",
      products: [{ name: "Desi Ghee 500ml", price: 850, description: "Bilona method, from our own buffaloes" }] as any,
    });

  it("THE START BOUNDARY EARNS ITS KEEP ON MULTI-WORD TERMS", () => {
    // The end boundary only applies to short single tokens, so for
    // "a grade" the START is the only thing stopping "mega grade" from
    // matching. A mutation removing it survived the first pass because
    // every case I had written was covered by the end boundary instead.
    const r = stripUnsupported("Woven on a mega grade loom.", dairy(), "publish");
    expect(r.removed.join(" ")).not.toMatch(/"a grade"/);
    // And the real term is still caught.
    expect(stripUnsupported("A grade silk only.", dairy(), "publish").removed.join(" ")).toMatch(/a grade/);
  });

  it("A RECORDED 'desi ghee' LICENSES 'pure ghee' IN THE REAL GUARD", () => {
    // One fact, two phrasings — asking the owner to attest both would be
    // the software failing to understand its own question. This was only
    // tested against the dry-run SCRIPT's copy of the families, so
    // deleting the real ones in claimCheck broke nothing.
    const r = stripUnsupported("Pure ghee, 850.", dairy(), "publish");
    expect(r.removed.join(" ")).not.toMatch(/pure ghee/);
    expect(r.text).toBe("Pure ghee, 850.");
  });

  it("but an unrelated claim is NOT licensed by the ghee listing", () => {
    // The families must stay narrow: a narrow claim never licenses a
    // broader one.
    expect(stripUnsupported("A2 milk paneer.", dairy(), "publish").removed.join(" ")).toMatch(/a2 milk/);
  });

  it("and the other new families work the same way", () => {
    const fabric = textile({
      products: [{ name: "Kurta fabric", price: 480, description: "100% cotton, colour fast" }] as any,
    });
    // "pure cotton" from a recorded "100% cotton"...
    expect(stripUnsupported("Pure cotton kurta fabric.", fabric, "publish").removed.join(" ")).not.toMatch(/pure cotton/);
    // ...and the British/American spelling pair.
    expect(stripUnsupported("Color fast dyes.", fabric, "publish").removed.join(" ")).not.toMatch(/color fast/);
  });
});
