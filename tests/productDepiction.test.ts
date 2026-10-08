// A GENERATED PICTURE OF THEIR CANDLE IS NOT THEIR CANDLE.
//
// 8 October 2026, published to a real Facebook Page: a pink candle in a
// glass jar with lavender sprigs and the words "LAVENDER SOY WAX /
// Candle by Qaaf" printed on it. No such candle exists and no such label
// exists. The owner supplied no photo; the generator invented the
// product and its packaging.
//
// The cause was not a missing instruction. b182ed5 had already told the
// chat not to OFFER generated product images, and the generate_graphic
// tool description repeats it. heroSubjectLine did the opposite IN CODE:
//
//   "The hero subject is this business's own product: Lavender candle
//    ... show that product as the main subject."
//
// That sentence was written for the case where the product's photo IS
// attached, where it means "restyle this, do not swap it". With no photo
// attached, the same sentence means "invent it". Code beats a tool
// description every time.
//
// So the PHOTO decides, and the same decision now applies on every path
// that reaches the generator: chat, the Graphic Design page, the ad
// engine and video briefs all build their brief through buildImageBrief.

import { describe, it, expect } from "vitest";
import {
  buildImageBrief,
  productDepictionFor,
  depictionNoteFor,
  NO_PRODUCT_DEPICTION_RULE,
} from "@/lib/claims/imageBrief";
import type { BusinessFacts, CatalogProduct } from "@/lib/claims/businessFacts";

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({
    id: "p1",
    name: "Lavender Soy Wax Candle",
    description: "Hand-poured soy wax",
    price: 550,
    images: [],
    category: "Candles",
    inventoryCount: 5,
    ...over,
  }) as CatalogProduct;

const facts = (over: Partial<BusinessFacts> = {}): BusinessFacts =>
  ({
    name: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    products: [product()],
    brand: { colors: null, language: null },
    ...over,
  }) as unknown as BusinessFacts;

describe("whether a generated image may show the product", () => {
  it("NO PHOTO ON FILE: depiction is forbidden", () => {
    expect(productDepictionFor(facts())).toBe("forbidden");
  });

  it("A REAL PHOTO ON FILE: depiction is allowed, because the photo is the reference", () => {
    const f = facts({ products: [product({ images: ["https://cdn.example/lavender.jpg"] })] });
    expect(productDepictionFor(f)).toBe("real_photo");
    expect(buildImageBrief("Diwali post", f).referenceImageUrl).toBe("https://cdn.example/lavender.jpg");
  });

  it("a business with nothing in its catalogue has no product to misrepresent", () => {
    expect(productDepictionFor(facts({ products: [] }))).toBe("not_applicable");
    expect(productDepictionFor(null)).toBe("not_applicable");
  });
});

describe("the brief the image model is actually given", () => {
  it("THE EXACT LIVE INSTRUCTION IS GONE: no hero-subject line without a photo", () => {
    const brief = buildImageBrief("A warm Christmas scene", facts());
    // This is the sentence that produced the invented candle.
    expect(brief.prompt).not.toMatch(/hero subject is this business's own product/);
    expect(brief.prompt).not.toMatch(/show that product as the main subject/);
  });

  it("and the model is told, in its own terms, what it must not draw", () => {
    const brief = buildImageBrief("A warm Christmas scene", facts());
    expect(brief.prompt).toContain(NO_PRODUCT_DEPICTION_RULE);
    // The three things that actually came back: the object, the jar, and
    // a brand name painted on as a label.
    expect(brief.prompt).toMatch(/DO NOT DEPICT THIS BUSINESS'S PRODUCT OR ITS PACKAGING/);
    expect(brief.prompt).toMatch(/jar, bottle, tin, box, label, wrapper or lid/);
    expect(brief.prompt).toMatch(/name rendered as packaging text/);
    // And what it should make instead, so the call still produces
    // something useful rather than failing.
    expect(brief.prompt).toMatch(/typography on a plain or brand-coloured ground/);
  });

  it("THE BRIEF NAMING THE PRODUCT IS STILL REFUSED", () => {
    // "MAKE POST ... FOR LAVENDER CANDLE" names the product, so the
    // anchor is never added and an anchor-only fix would have missed it
    // entirely. The rule goes on regardless.
    const brief = buildImageBrief("Lavender candle on a wooden table, Christmas mood", facts());
    expect(brief.anchored).toBe(false);
    expect(brief.prompt).toContain("Lavender candle on a wooden table, Christmas mood");
    expect(brief.prompt).toContain(NO_PRODUCT_DEPICTION_RULE);
  });

  it("the trade is kept, so the graphic is still about candles", () => {
    const brief = buildImageBrief("A warm Christmas scene", facts());
    expect(brief.prompt).toMatch(/for a Home fragrance business/);
    expect(brief.prompt).toMatch(/the product itself must not appear/);
  });

  it("WITH a photo, nothing changes — the restyle-around-the-real-thing path is untouched", () => {
    const f = facts({ products: [product({ images: ["https://cdn.example/lavender.jpg"] })] });
    const brief = buildImageBrief("A warm Christmas scene", f);
    expect(brief.prompt).toMatch(/hero subject is this business's own product/);
    expect(brief.prompt).not.toContain(NO_PRODUCT_DEPICTION_RULE);
    expect(brief.depictionNote).toBeNull();
  });

  it("a services business is not a fabricated product", () => {
    const service = product({ name: "Hydra facial", kind: "service", images: [] } as any);
    const f = facts({ products: [service] });
    expect(productDepictionFor(f)).toBe("not_applicable");
    expect(buildImageBrief("Diwali greeting post", f).prompt).not.toContain(NO_PRODUCT_DEPICTION_RULE);
  });
});

describe("what the owner is told", () => {
  it("names the product, says why, and says how to fix it", () => {
    const note = depictionNoteFor(facts());
    expect(note).toMatch(/"Lavender Soy Wax Candle"/);
    expect(note).toMatch(/no photo of/);
    // The reason, in the owner's terms rather than ours.
    expect(note).toMatch(/isn't your product/);
    expect(note).toMatch(/could end up public/);
    expect(note).toMatch(/Add a real photo/);
    expect(buildImageBrief("A warm Christmas scene", facts()).depictionNote).toBe(note);
  });

  it("the note is absent when there is nothing to explain", () => {
    const f = facts({ products: [product({ images: ["https://cdn.example/lavender.jpg"] })] });
    expect(buildImageBrief("x", f).depictionNote).toBeNull();
  });
});
