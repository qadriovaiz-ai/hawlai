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
  hasAnythingRecorded,
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
    expect(v.missing).toBe("the product's name, or what makes it yours");
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
    const note = genericNote({ missing: "the product's name, or what makes it yours" });
    expect(note).toMatch(/Add the product's name, or what makes it yours/);
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
    expect(missingSpecific(facts())).toBe("the product's name, or what makes it yours");
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
    const brief = retryBrief({ generic: true, opener: null, missing: "the product's name, or what makes it yours" }, facts());
    expect(brief).toMatch(/Lavender jar \(₹450\)/);
    expect(brief).toMatch(/Lucknow/);
    expect(brief).toMatch(/not a number you invent/);
  });

  it("asks for ONE thing, not everything on record", () => {
    const brief = retryBrief({ generic: true, opener: null, missing: "the product's name, or what makes it yours" }, facts());
    expect(brief).toMatch(/Put ONE thing/);
  });

  it("a business with no catalogue gets no invented 'on record' line", () => {
    const brief = retryBrief({ generic: true, opener: null, missing: "a detail from your own notes" }, facts({ products: [], city: null }));
    expect(brief).not.toMatch(/On record:/);
    expect(brief).not.toMatch(/Where:/);
  });
});

describe("THE CAPTION THAT STARTED THIS MUST BE CAUGHT", () => {
  // My first version of the specific rule counted a real PRICE as
  // sufficient — and storeEcho's own header had already written down why
  // that is wrong, about this exact caption:
  //
  //   "The price (₹800) and the duration (90 minutes) come from the
  //    catalogue — every competitor has those too, and counting them
  //    would have passed the very caption that started this."
  //
  // It would have passed it. These are the fixtures that stop that
  // happening again.
  const workshopFacts = facts({
    businessName: "Test Business",
    category: "home fragrance",
    city: "Shahjahanpur",
    products: [{ name: "Candle Making Workshop", price: 800, description: "90 minutes" }] as any,
    offers: [],
    ownerFacts: [
      { category: "business_story", title: "Curing", content: "Har candle 24 ghante cure hoti hai — ek poora batch kharab karke seekha." },
    ] as any,
  });

  const REAL_GENERIC = {
    text: "Wax pighlaao, fragrance chunno, apne haathon se banao. 90 minutes. Ek candle jo tumhari apni hai. Workshop ₹800 mein — link in bio se book karo.",
  };

  it("A REAL PRICE DOES NOT RESCUE IT", () => {
    const v = isGeneric(REAL_GENERIC, workshopFacts, "hinglish");
    // The price IS found — it is real.
    expect(specificsIn(REAL_GENERIC, workshopFacts)).toContain("a real price");
    // And it is still generic, because a price is table stakes.
    expect(v.generic).toBe(true);
    expect(v.missing).toBeTruthy();
  });

  it("the compressed version, with a recorded detail, passes", () => {
    const specific = {
      text: "Pighlaao, khushboo chuno, dhaalo — 90 minute mein apni pehli candle. Temperature ka sabr: ek poora batch kharab karke seekha. ₹800, link in bio.",
    };
    expect(isGeneric(specific, workshopFacts, "hinglish").generic).toBe(false);
  });

  it("A DURATION DOES NOT RESCUE IT EITHER", () => {
    // "90 minutes" is in the product description, so a naive
    // catalogue-word check would count it.
    const v = isGeneric({ text: "90 minutes aur ek candle tumhari." }, workshopFacts, "hinglish");
    expect(v.generic).toBe(true);
  });

  it("the full product NAME does rescue it — that is this business's", () => {
    const v = isGeneric({ text: "Candle Making Workshop is open this Saturday." }, workshopFacts, "english");
    expect(v.generic).toBe(false);
  });

  it("and the city does", () => {
    expect(isGeneric({ text: "Shahjahanpur mein banti hai." }, workshopFacts, "hinglish").generic).toBe(false);
  });
});

describe("a business that has recorded nothing cannot be faulted", () => {
  // Mirrors usesOwnStory, whose comment says it best: "a business that
  // hasn't written one can't be failed for missing it." An existing
  // integration test caught this when the gate was inverted — such a
  // business was being marked generic and told to add something it had
  // no way to add, and the retry would have run with nothing to hand the
  // model but an instruction to be specific.
  const empty = facts({ products: [], offers: [], city: null, ownerFacts: [] });

  it("HAS NOTHING RECORDED is detected", () => {
    expect(hasAnythingRecorded(empty)).toBe(false);
    expect(hasAnythingRecorded(facts())).toBe(true);
    expect(hasAnythingRecorded(null)).toBe(false);
  });

  it("one product is enough to count as recorded", () => {
    expect(hasAnythingRecorded(facts({ offers: [], city: null, ownerFacts: [] }))).toBe(true);
  });

  it("a city alone counts", () => {
    expect(hasAnythingRecorded(facts({ products: [], offers: [], ownerFacts: [] }))).toBe(true);
  });

  it("an EMPTY owner note does not count as recorded", () => {
    // A blank row saved by a half-finished interview is not a fact.
    const blank = facts({ products: [], offers: [], city: null, ownerFacts: [{ category: "business_story", title: "x", content: "   " }] as any });
    expect(hasAnythingRecorded(blank)).toBe(false);
  });

  it("IT IS NOT MARKED GENERIC, and is asked for nothing", () => {
    const v = isGeneric({ text: "Beautiful scents for a calmer home." }, empty, "english");
    expect(v.generic).toBe(false);
    expect(v.missing).toBeNull();
  });

  it("but a worn opener is STILL caught — that needs no records", () => {
    const v = isGeneric({ text: "Elevate your evenings." }, empty, "english");
    expect(v.generic).toBe(true);
    expect(v.opener).toBe("Elevate your…");
  });

  it("THE RETRY BRIEF IS EMPTY, so no model call is made with nothing to offer", () => {
    // Defence in depth: even if the verdict said generic, a brief with
    // nothing concrete in it makes the caller skip the retry. A call that
    // can only make the model invent is worse than no call.
    const brief = retryBrief({ generic: true, opener: null, missing: "anything at all" }, empty);
    expect(brief.trim()).toBe("");
  });

  it("and with an opener it is NOT empty, because that is fixable without records", () => {
    const brief = retryBrief({ generic: true, opener: "Elevate your…", missing: null }, empty);
    expect(brief).toMatch(/Do NOT open with/);
  });
});
