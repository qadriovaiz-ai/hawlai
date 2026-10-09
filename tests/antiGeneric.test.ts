// Copy any business in the same line of work could have published.
//
// TIRED_MOVES in contentMarketingAgent listed fifteen worn openings — in
// the PROMPT. Nothing checked afterwards. These tests are the check.
//
// Every banned opener has a case in Hinglish as well as English, because
// Hawlai's default register is Hinglish and an English-only guard would
// work on the copy this product writes least. The two NEGATIVE cases at
// the end of that block matter as much as the positives: the same phrase
// mid-piece must pass, and a Devanagari pattern must not fire on a
// romanised piece.

import { describe, it, expect } from "vitest";
import {
  openerProblem,
  specificsIn,
  missingSpecific,
  isGeneric,
  genericNote,
  retryBrief,
} from "@/lib/content/antiGeneric";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Test Business",
    category: "home fragrance",
    city: "Lucknow",
    products: [{ name: "Lavender jar", description: "Soy wax, 200g", price: 450 }],
    offers: [{ code: "DIWALI10", label: "Diwali bundle", percent: 10, flat: null }],
    ownerFacts: [
      { category: "business_story", title: "The mistake I learnt from", content: "Ek poora batch kharab kiya tha. Ab 24 ghante cure karti hoon." },
    ],
    pillars: [],
    site: null,
    brand: {} as any,
    ...over,
  } as unknown as BusinessFacts;
}

describe("worn openers, in every register Hawlai writes", () => {
  const ENGLISH: [string, string][] = [
    ["Struggling with dull evenings? Try this.", "Struggling with…"],
    ["Are you tired of candles that fade?", "Are you tired of…"],
    // The two-sentence form reports the more specific label, because
    // that is the move the model actually reached for.
    ["Looking for a gift? Look no further.", "Looking for X? Look no further"],
    ["Look no further — this is the one.", "Look no further"],
    ["In today's fast-paced world, slow down.", "In today's fast-paced world"],
    ["Elevate your evenings with us.", "Elevate your…"],
    ["Unlock the secret to a calm room.", "Unlock the…"],
    ["Imagine this: a quiet room.", "Imagine…"],
    ["Say goodbye to dull rooms.", "Say goodbye to…"],
    ["Introducing our newest jar.", "Introducing / Meet the…"],
  ];

  it.each(ENGLISH)("ENGLISH: %s", (text, label) => {
    expect(openerProblem({ text }, "english")).toBe(label);
  });

  const HINGLISH: [string, string][] = [
    ["Dull shaam ki tension? Ye try karo.", "…ki tension?"],
    ["Thak gaye ho aise candles se?", "Thak gaye ho…"],
    ["Aapki talash khatam hui.", "Aapki talash khatam"],
    ["Aaj ke zamane mein sab jaldi mein hai.", "Aaj ke zamane mein"],
    ["Apni shaam ko upgrade karo.", "…ko upgrade karo"],
    ["Ek shaant kamre ka raaz yahi hai.", "…ka raaz"],
    ["Zara socho — ek shaant kamra.", "Zara socho…"],
    ["Purani mehak ko bye bolo.", "…ko bye bolo"],
  ];

  it.each(HINGLISH)("HINGLISH: %s", (text, label) => {
    expect(openerProblem({ text }, "hinglish")).toBe(label);
  });

  const HINDI: [string, string][] = [
    ["आज के ज़माने में सब जल्दी में है।", "आज के ज़माने में"],
    ["थक गए हैं ऐसी मोमबत्तियों से?", "थक गए हैं…"],
    ["ज़रा सोचिए — एक शांत कमरा।", "ज़रा सोचिए…"],
  ];

  it.each(HINDI)("HINDI: %s", (text, label) => {
    expect(openerProblem({ text }, "hindi")).toBe(label);
  });

  it("AN ENGLISH OPENER IS CAUGHT IN HINGLISH COPY TOO", () => {
    // Hinglish copy borrows English freely, so the English list applies
    // to every register.
    expect(openerProblem({ text: "Elevate your shaam with this jar." }, "hinglish")).toBe("Elevate your…");
  });

  it("A PIECE IS CHECKED AGAINST ITS OWN REGISTER'S LIST, PLUS ENGLISH", () => {
    // The first version of this test fed ROMANISED text to the Hindi
    // list and expected null - which no Devanagari pattern could have
    // matched anyway, so it proved nothing and a mutation enabling
    // cross-script matching survived it. Devanagari text in a piece
    // declared English is the case that actually distinguishes them.
    //
    // This is a LIMIT, not a safety property: a worn Hindi opener in a
    // piece declared English goes unflagged. Worth knowing rather than
    // dressed up as protection.
    expect(openerProblem({ text: "आज के ज़माने में सब जल्दी में है।" }, "english")).toBeNull();
    expect(openerProblem({ text: "आज के ज़माने में सब जल्दी में है।" }, "hindi")).toBe("आज के ज़माने में");
  });

  it("THE SAME PHRASE MID-PIECE IS FINE", () => {
    // "Zara socho" is a legitimate turn of phrase. As an OPENING it is
    // the model reaching for the same move every time.
    expect(openerProblem({ text: "Lavender jar, 200g. Zara socho — ek shaant kamra." }, "hinglish")).toBeNull();
    expect(openerProblem({ text: "Soy wax, hand poured. Imagine this: quiet." }, "english")).toBeNull();
  });

  it("every field's first sentence is checked, not just the first field", () => {
    // Which field comes first in the JSON is an accident of the schema;
    // a carousel's first slide is a place a reader starts too.
    expect(openerProblem({ headline: "Lavender jar", slides: [{ body: "Elevate your evenings." }] }, "english")).toBe("Elevate your…");
  });

  it("honest copy is left alone", () => {
    expect(openerProblem({ text: "Lavender jar, 200g. ₹450. Lucknow." }, "english")).toBeNull();
    expect(openerProblem({ text: "24 ghante cure hone ke baad hi ghar jaati hai." }, "hinglish")).toBeNull();
  });

  it("an empty piece has no opener problem", () => {
    expect(openerProblem({}, "english")).toBeNull();
    expect(openerProblem({ text: "   " }, "english")).toBeNull();
  });
});

describe("at least one recorded specific", () => {
  it("A PRODUCT NAME COUNTS", () => {
    expect(specificsIn({ text: "The Lavender jar is back." }, facts())).toContain("a product name");
  });

  it("a REAL price counts; an invented one does not", () => {
    expect(specificsIn({ text: "₹450 and it ships today." }, facts())).toContain("a real price");
    expect(specificsIn({ text: "₹999 and it ships today." }, facts())).not.toContain("a real price");
  });

  it("a real offer counts, by label or by code", () => {
    expect(specificsIn({ text: "Ask for the Diwali bundle." }, facts())).toContain("a real offer");
    expect(specificsIn({ text: "Use DIWALI10 at checkout." }, facts())).toContain("a real offer");
  });

  it("the city counts", () => {
    expect(specificsIn({ text: "Made in Lucknow." }, facts())).toContain("where the business is");
  });

  it("a word from the owner's own notes counts", () => {
    expect(specificsIn({ text: "24 ghante cure hone ke baad." }, facts())).toContain("a detail you recorded");
  });

  it("THE CATEGORY IS NOT A SPECIFIC", () => {
    // "home fragrance" is what every competitor sells. Counting it would
    // pass the very copy this rule exists to catch.
    const r = specificsIn({ text: "Beautiful home fragrance for your space." }, facts({ products: [{ name: "home fragrance" }] as any }));
    expect(r).toHaveLength(0);
  });

  it("GENERIC COPY CARRIES NOTHING", () => {
    expect(specificsIn({ text: "Transform your space with beautiful scents you'll love." }, facts())).toHaveLength(0);
  });
});

describe("the verdict", () => {
  it("A WORN OPENER ALONE MAKES IT GENERIC", () => {
    const v = isGeneric({ text: "Elevate your evenings with the Lavender jar at ₹450." }, facts(), "english");
    expect(v.generic).toBe(true);
    expect(v.opener).toBe("Elevate your…");
    // The specific IS there, so it is not also asking for one.
    expect(v.missing).toBeNull();
  });

  it("NO SPECIFIC ALONE MAKES IT GENERIC", () => {
    const v = isGeneric({ text: "Beautiful scents for a calmer home." }, facts(), "english");
    expect(v.generic).toBe(true);
    expect(v.opener).toBeNull();
    expect(v.missing).toBe("the product's name or price");
  });

  it("honest specific copy passes", () => {
    const v = isGeneric({ text: "Lavender jar, 200g, ₹450. Made in Lucknow." }, facts(), "english");
    expect(v.generic).toBe(false);
  });

  it("WITH NO FACTS IT IS NOT GENERIC — the opposite direction from the claims guard", () => {
    // Deliberate, and the reason is in the module header: an unsupported
    // CLAIM is wrong whatever the records say, so that guard fails
    // closed. Genericness is not — with nothing readable to be specific
    // ABOUT, a piece cannot be faulted for lacking it, and retrying
    // would spend a model call to produce the same words.
    const v = isGeneric({ text: "Beautiful scents for a calmer home." }, null, "english");
    expect(v.generic).toBe(false);
    expect(v.missing).toBeNull();
  });

  it("but a worn opener is still caught with no facts", () => {
    // That one needs no records to judge.
    const v = isGeneric({ text: "Elevate your evenings." }, null, "english");
    expect(v.generic).toBe(true);
    expect(v.opener).toBe("Elevate your…");
  });
});

describe("what the owner is told", () => {
  it("THE NOTE NAMES THE FIX, not the fault", () => {
    const note = genericNote({ missing: "the product's name or price" });
    expect(note).toMatch(/Add the product's name or price/);
    expect(note).toMatch(/any business in your line of work/);
  });

  it("a worn opener is quoted back so it is recognisable", () => {
    expect(genericNote({ opener: "Elevate your…" })).toMatch(/"Elevate your…"/);
  });

  it("IT DOES NOT ASK FOR THE FOUNDER'S STORY", () => {
    // GENERIC_NOTE used to. Withdrawn as the default on 2026-10-09
    // (docs/PRINCIPLES.md P1) — a stranger reading a caption cares about
    // the product and about themselves.
    const note = genericNote({ missing: missingSpecific(facts()), opener: "Imagine…" });
    expect(note).not.toMatch(/story/i);
  });

  it("only ONE thing is asked for, and only something this business could supply", () => {
    // A list of five is a lecture; asking a business with no products
    // for a price is noise.
    expect(missingSpecific(facts())).toBe("the product's name or price");
    const noProducts = facts({ products: [] });
    expect(missingSpecific(noProducts)).toBe("a detail from your own notes");
    const nothing = facts({ products: [], ownerFacts: [] });
    expect(missingSpecific(nothing)).toBe("what's included, or the occasion people buy it for");
  });

  it("nothing wrong, nothing said", () => {
    expect(genericNote({})).toBe("");
  });
});

describe("the retry brief", () => {
  it("NAMES THE OPENER TO AVOID", () => {
    const brief = retryBrief({ generic: true, opener: "Elevate your…", missing: null }, facts());
    expect(brief).toMatch(/Do NOT open with "Elevate your…"/);
  });

  it("HANDS IT THE RECORD RATHER THAN ASKING IT TO INVENT", () => {
    // The whole failure mode this product has is a model filling a gap.
    // The retry gets the catalogue, and is told not to add to it.
    const brief = retryBrief({ generic: true, opener: null, missing: "the product's name or price" }, facts());
    expect(brief).toMatch(/Lavender jar \(₹450\)/);
    expect(brief).toMatch(/Lucknow/);
    expect(brief).toMatch(/not a number you invent/);
  });

  it("asks for ONE thing, not everything on record", () => {
    const brief = retryBrief({ generic: true, opener: null, missing: "the product's name or price" }, facts());
    expect(brief).toMatch(/Put ONE thing/);
  });

  it("a business with no catalogue gets no invented 'on record' line", () => {
    const brief = retryBrief({ generic: true, opener: null, missing: "a detail from your own notes" }, facts({ products: [], city: null }));
    expect(brief).not.toMatch(/On record:/);
    expect(brief).not.toMatch(/Where:/);
  });
});
