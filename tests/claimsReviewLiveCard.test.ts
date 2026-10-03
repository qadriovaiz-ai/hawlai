// The live card: 17 items for 11 sentences, four of them wrong.
//
// Every sentence here is one the owner actually read on their own site
// on 3 Oct 2026, and the four false positives are the same class of
// mistake as the "Our Candles" refusal — a heading read as a product
// nobody sells.
//
// THE REVIEW AND THE CHAT EDITOR DO call the same function. The
// stoplist was simply short: "handmade" was in it and "handcrafted" was
// not; "every" was in it and "har" — the Hinglish word for it — was
// not; and nothing stopped a question word or the business's own name
// from being read as a product.
//
// Extending the stoplist alone would be whack-a-mole, so the rule
// changed shape too: a NAME needs a name in it. Every word being in the
// vocabulary used to be the test, so one word outside it was enough to
// condemn a heading. What actually marks a product is a proper noun
// that is neither the category, nor the brand, nor a word any heading
// uses. "Diwali sets" has one; "Har candle" does not.

import { describe, it, expect, vi } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import { unknownProductName } from "@/lib/pages/editPage";
import { groupBySentence, type ReviewItem } from "@/lib/claims/siteClaimsReview";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

function facts(): BusinessFacts {
  const home = { slug: "home", pageType: "home", title: "Home", headings: [], paragraphs: [], buttons: [], metaDescription: null, hasShareImage: false } as any;
  return {
    // The real brand name, which is what made "Why Candle by Qaaf" into
    // a product called "Why Candle".
    businessName: "Candle by Qaaf",
    category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [home] }, home,
    products: [
      { id: "p1", name: "Lavender candle", price: 999, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true },
      { id: "p2", name: "Candle Making Workshop", price: 800, description: "1h30", images: [], inventory: null, category: null, active: true },
    ],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 46, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 2.1, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 }, ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-03"), unreadable: [],
  } as BusinessFacts;
}

describe("the four false positives on the live card", () => {
  it("does not read the business's own name as a product", () => {
    // "Why Candle by Qaaf" — a heading on their own About page, flagged
    // as a product called "Why Candle".
    expect(unknownProductName("Why Candle by Qaaf", facts())).toBeNull();
  });

  it("does not read the category as a product, whichever craft word it uses", () => {
    // "handmade" was in the stoplist. "handcrafted" was not.
    expect(unknownProductName("Light Up the Season — Handcrafted Candles for a Warm Christmas Gift", facts())).toBeNull();
    for (const heading of ["Handcrafted Candles", "Handmade Soy Candles", "Artisan Candles", "Premium Scented Candles"]) {
      expect(unknownProductName(heading, facts()), heading).toBeNull();
    }
  });

  it("does not read a Hinglish determiner as a product", () => {
    // "Har candle ke peeche ek kahaani hai" is "every candle has a
    // story behind it" — flagged three times across two pages. Every
    // Indian business writing the way its customers speak hits this.
    expect(unknownProductName("Har candle ke peeche ek kahaani hai, aur hum aapki bhi sunna chahte hain.", facts())).toBeNull();
    expect(unknownProductName("Har candle yahan haath se poured hai — small batches, clean soy wax…", facts())).toBeNull();
  });

  it("covers the other Hinglish determiners too, not just the one that bit", () => {
    for (const word of ["Sab", "Sabhi", "Ek", "Apni", "Apna", "Humari", "Hamare", "Yeh", "Woh", "Meri"]) {
      expect(unknownProductName(`${word} candle haath se poured hai.`, facts()), word).toBeNull();
    }
  });

  it("and the headings that were already right stay right", () => {
    for (const heading of ["Our Candles", "The Candle Shop", "Shop All Candles", "Our Collection", "Home Fragrance"]) {
      expect(unknownProductName(heading, facts()), heading).toBeNull();
    }
  });
});

describe("the real ones are still flagged", () => {
  it("names a festival product the catalogue does not have", () => {
    // Legitimate: there is no Diwali set and no Diwali hamper in the
    // catalogue, which holds a Lavender candle and a workshop.
    expect(unknownProductName("Premium, personal packaging made for gifting — especially our Diwali sets.", facts())).toBe("Diwali sets");
    expect(unknownProductName("Our Diwali hampers are ready to order.", facts())).toBe("Diwali hampers");
  });

  it("reports only the words that are the problem", () => {
    // "Our Diwali hampers" → "Diwali hampers": the possessive is not
    // part of the name and showing it invites the owner to argue about
    // the wrong half.
    expect(unknownProductName("Our Diwali hampers are ready.", facts())).not.toMatch(/^Our/);
  });

  it("still catches a product Hawlai invented outright", () => {
    expect(unknownProductName("Try our Midnight Oud Candle today.", facts())).toBe("Midnight Oud Candle");
  });

  it("recognises a product that IS in the catalogue, by either name", () => {
    expect(unknownProductName("Book the Candle Making Workshop.", facts())).toBeNull();
    expect(unknownProductName("Our Lavender candle is poured by hand.", facts())).toBeNull();
  });
});

// ---- one row per sentence --------------------------------------------

const flag = (over: Partial<ReviewItem>): ReviewItem =>
  ({
    pageId: "p-home", pageSlug: "home", pageTitle: "Home", blockId: "b1", field: "html",
    sentence: "Safer than mass-market paraffin, every time.",
    reason: "a comparison with competitors that nothing on record supports",
    kind: "comparative", claim: null, keepable: false,
    removeLeaves: "", removable: true,
    ...over,
  }) as ReviewItem;

describe("the same sentence is one decision, not several", () => {
  it("collapses two reasons on one sentence into one row", () => {
    // Home's "safer than mass-market" appeared twice: once from the
    // comparative rule, once from the material-claim rule.
    const groups = groupBySentence([
      flag({}),
      flag({ reason: '"mass-market" — the business doesn\'t claim this anywhere', kind: "claim", claim: "mass-market", keepable: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasons).toHaveLength(2);
    expect(groups[0].kinds).toEqual(["comparative", "claim"]);
  });

  it("offers no Keep on a sentence that contains a comparison", () => {
    // Even though the second flag was keepable on its own: the owner
    // cannot attest half a line whose other half compares them with
    // somebody else's product.
    const groups = groupBySentence([
      flag({}),
      flag({ reason: '"mass-market" — not claimed', kind: "claim", claim: "mass-market", keepable: true }),
    ]);
    expect(groups[0].keepableClaims).toEqual([]);
  });

  it("keeps two genuinely different phrases as two Keep buttons", () => {
    // Contact's "Diwali hampers / wedding favours" line: one sentence,
    // two things in question, and each Keep records only its own words.
    const sentence = "Ask about our Diwali hampers and wedding favours.";
    const groups = groupBySentence([
      flag({ sentence, reason: 'this page offers "Diwali hampers", and there is no such product', kind: "product", claim: "Diwali hampers", keepable: true }),
      flag({ sentence, reason: 'this page offers "wedding favours", and nothing mentions it', kind: "offer", claim: "wedding favours", keepable: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].keepableClaims).toEqual(["Diwali hampers", "wedding favours"]);
  });

  it("does not merge the same sentence on two different pages", () => {
    // "Har candle" appeared on Contact and on Shop. One sentence per
    // page is two decisions, because removing it is two edits.
    const groups = groupBySentence([
      flag({ pageId: "p-contact", pageSlug: "contact", sentence: "Har candle." }),
      flag({ pageId: "p-shop", pageSlug: "shop", sentence: "Har candle." }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("refuses removal of the group when any rule on it refuses", () => {
    const groups = groupBySentence([
      flag({ removable: true }),
      flag({ reason: "another", kind: "claim", removable: false }),
    ]);
    expect(groups[0].removable).toBe(false);
  });

  it("drops a duplicate reason rather than listing it twice", () => {
    const groups = groupBySentence([flag({}), flag({})]);
    expect(groups[0].reasons).toHaveLength(1);
  });
});

describe("the card counts sentences", () => {
  it("keys a row by its sentence, so one decision settles it", async () => {
    const { readFileSync } = await import("fs");
    const card = readFileSync("src/components/seo/ClaimsReview.tsx", "utf8");
    expect(card).toMatch(/const key = \(item: Item\) => `\$\{item\.pageId\}:\$\{item\.blockId \?\? ""\}:\$\{item\.field\}:\$\{item\.sentence\}`/);
    // And lists every reason on the row.
    expect(card).toMatch(/item\.reasons\.map/);
  });

  it("the route groups before it answers", async () => {
    const { readFileSync } = await import("fs");
    const route = readFileSync("src/app/api/seo/claims-review/route.ts", "utf8");
    expect(route).toMatch(/const items = groupBySentence\(flags\)/);
    // Both numbers are reported: sentences to decide, and flags behind
    // them, so the drop from 17 to 11 is explicable rather than a
    // suspicion that something went missing.
    expect(route).toMatch(/flags: flags\.length/);
  });
});
