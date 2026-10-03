// The review was still silent on the live site, after I reported it fixed.
//
// WHAT I GOT WRONG. 6da4649 made the review and read_page share one
// reader, and I reported that Home's and About's lines "now appear".
// They did appear — on my fixtures. Production disagreed: the card
// listed seven items, every one of them a gift-sets offer or a contact
// detail, and nothing from About at all. My fixtures were flat, shallow
// and carried explicit `_source: "generated"` on every block. The live
// rows are nested three deep and carry no block mark at all.
//
// TWO SUPPRESSIONS, both invisible to a fixture that marks its blocks:
//
//   1. `said(phrase)` in findUnsupportedClaims skips a flag when the
//      phrase appears in knownText — and knownText includes the
//      business's own site. A page Hawlai wrote was therefore its own
//      evidence: the check found "safer than mass-market paraffin" on
//      the site and concluded the business had said it. The only items
//      that reached the card were the ones that BYPASS `said` — the
//      offer patterns and the contact scrub. Which is exactly the seven.
//
//   2. The copy only leaves the evidence if ownerWritten() can tell who
//      wrote it, and it was asking the BLOCK. The live blocks carry no
//      `_source`; the page row carries content_source 'generated'. So
//      the authority Hawlai actually has was sitting one level up, being
//      ignored.
//
// So this file builds its pages the way production stores them, and the
// shape is the point.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import { reviewPage, factsWithoutGeneratedCopy } from "@/lib/claims/siteClaimsReview";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

// The live sentences, from the owner's own site.
const HOME_SAFER = "Safer than mass-market paraffin, every time.";
const HOME_CLEAN = "Just clean burning candles, poured by hand.";
const ABOUT_COMPARATIVE = "Our soy wax burns slower, cleaner, and safer than mass-market paraffin.";
const ABOUT_BETTER = "It burns better and safer.";
const ABOUT_GIFTING = "Premium, personal packaging made for gifting — especially our Diwali sets.";

/**
 * A page as the builder really nests one: Section > Stack > Stack >
 * Heading/Text/Button, and NO `_source` on any block — which is the
 * state every row written before per-block marking is in.
 */
function productionPage(id: string, slug: string, title: string, lines: { type: string; prop: string; value: string }[]) {
  return {
    id,
    slug,
    title,
    page_type: slug === "home" ? "home" : slug.includes("privacy") || slug.includes("terms") ? "legal" : slug,
    // The authority Hawlai has about who wrote this page.
    content_source: "generated",
    sections: [
      {
        id: `${id}-s1`,
        type: "section",
        props: { background: "none", paddingY: "lg" },
        children: [
          {
            id: `${id}-st1`,
            type: "stack",
            props: { direction: "column", align: "center", gap: "md" },
            children: [
              {
                id: `${id}-st2`,
                type: "stack",
                props: { direction: "column", gap: "sm" },
                children: lines.map((line, i) => ({
                  id: `${id}-b${i}`,
                  type: line.type,
                  props: { [line.prop]: line.value, align: "center" },
                  children: [],
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

const SITE = [
  productionPage("p-home", "home", "Home", [
    { type: "heading", prop: "text", value: "Candles by Qaaf" },
    { type: "text", prop: "html", value: `<p>${HOME_SAFER} ${HOME_CLEAN}</p>` },
    { type: "button", prop: "label", value: "Shop the Collection" },
  ]),
  productionPage("p-about", "about", "About", [
    { type: "heading", prop: "text", value: "Our story" },
    { type: "text", prop: "html", value: `<p>${ABOUT_COMPARATIVE} ${ABOUT_BETTER}</p>` },
    { type: "text", prop: "html", value: `<p>${ABOUT_GIFTING}</p>` },
  ]),
];

/**
 * Facts as gatherBusinessFactsSafely really returns them: the site's own
 * copy is IN them. That is the whole mechanism — without it the
 * suppression cannot be reproduced, and a fixture with empty site pages
 * is why I reported this fixed when it was not.
 */
function facts(): BusinessFacts {
  const page = (slug: string, title: string, headings: string[], paragraphs: string[], buttons: string[]) =>
    ({ slug, pageType: slug, title, headings, paragraphs, buttons, metaDescription: null, hasShareImage: false }) as any;
  const home = page("home", "Home", ["Candles by Qaaf"], [`${HOME_SAFER} ${HOME_CLEAN}`], ["Shop the Collection"]);
  return {
    businessName: "candle_by_qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: {
      url: "/site/candle-by-qaaf", published: true,
      pages: [home, page("about", "About", ["Our story"], [`${ABOUT_COMPARATIVE} ${ABOUT_BETTER}`, ABOUT_GIFTING], [])],
    },
    home,
    products: [{ id: "p1", name: "Lavender candle", price: 999, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 46, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 2.1, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    // The owner's three confirmed facts, as recorded.
    ownerFacts: [
      { category: "business_story", title: "Wax", content: "Paraffin-free. Soy wax only." },
      { category: "business_story", title: "How", content: "Hand-poured in small batches." },
      { category: "business_story", title: "Where", content: "Made in Shahjahanpur, Uttar Pradesh." },
    ] as any,
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-03"), unreadable: [],
  } as BusinessFacts;
}

/** The review as the route runs it: honest facts, then every page. */
function cardItems() {
  const honest = factsWithoutGeneratedCopy(facts(), SITE as any);
  return SITE.flatMap((page) => reviewPage(page as any, honest));
}

describe("the page's own copy is not its own evidence", () => {
  it("takes generated copy out of the facts using the PAGE's mark", () => {
    // The blocks carry no _source. content_source does, and it is the
    // authority Hawlai has — ignoring it left the site vouching for
    // itself.
    const honest = factsWithoutGeneratedCopy(facts(), SITE as any);
    const everything = (honest.site?.pages ?? []).flatMap((p) => [...p.headings, ...p.paragraphs, ...p.buttons]).join(" ");
    expect(everything).not.toContain("safer than mass-market");
    expect(everything).not.toContain("clean burning");
    expect(everything).not.toContain("burns better and safer");
  });

  it("keeps the owner's recorded facts as evidence", () => {
    // Nothing here should make the review stricter about what the owner
    // genuinely confirmed.
    const honest = factsWithoutGeneratedCopy(facts(), SITE as any);
    expect((honest.ownerFacts ?? []).map((k: any) => k.content).join(" ")).toContain("Paraffin-free");
  });
});

describe("the lines production showed and the card did not", () => {
  it("flags About's comparative, three levels deep, with no block mark", () => {
    const about = cardItems().filter((i) => i.pageSlug === "about").map((i) => i.sentence).join(" | ");
    expect(about).toContain("safer than mass-market paraffin");
    expect(about).toContain("burns better and safer");
  });

  it("flags Home's two lines, not just the gift-sets one", () => {
    const home = cardItems().filter((i) => i.pageSlug === "home").map((i) => i.sentence).join(" | ");
    expect(home).toContain("Safer than mass-market paraffin");
    expect(home).toContain("clean burning");
  });

  it("flags the gifting line as a product the shop doesn't have", () => {
    // "especially our Diwali sets" reached nothing: the offer patterns
    // look for discounts and free shipping, and this promises neither.
    // It promises a PRODUCT, and the catalogue has a Lavender candle and
    // a workshop.
    const items = cardItems().filter((i) => i.sentence.includes("Diwali sets"));
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.kind === "product")).toBe(true);
    const product = items.find((i) => i.kind === "product")!;
    expect(product.reason).toMatch(/no such product in your catalogue/);
    // Keep is not offered: the fix is to add the product, not to attest
    // it, which would leave the page selling something nobody can ship.
    expect(product.keepable).toBe(false);
  });

  it("reaches both pages, which is what production disproved", () => {
    expect([...new Set(cardItems().map((i) => i.pageSlug))].sort()).toEqual(["about", "home"]);
  });
});

describe("a comparison is never supported by our own facts", () => {
  it("is flagged whatever the business has on record", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    const f = facts();
    // Even with the sentence verbatim in knownText — which is how the
    // site came to vouch for itself — a comparison still goes on the
    // list. Nothing a business says about ITSELF can establish how it
    // compares with somebody else's product.
    expect(findUnsupportedClaims(ABOUT_COMPARATIVE, f).length).toBeGreaterThan(0);
    expect(findUnsupportedClaims(ABOUT_BETTER, f).length).toBeGreaterThan(0);
    expect(findUnsupportedClaims(HOME_SAFER, f).length).toBeGreaterThan(0);
  });

  it("does not fire on ordinary copy with no comparison in it", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    expect(findUnsupportedClaims("Hand-poured in small batches in Shahjahanpur.", facts())).toEqual([]);
    expect(findUnsupportedClaims("Soy wax only — paraffin-free, always.", facts())).toEqual([]);
  });
});

describe("the owner's confirmed facts do not silence a comparative", () => {
  it("'paraffin-free, soy wax only' allows the material claim and not the comparison", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    const f = facts();
    // The equivalence grouping is doing its job on the material claim.
    expect(findUnsupportedClaims("No paraffin in any of our candles.", f)).toEqual([]);
    // And must not reach past it to the comparison.
    expect(findUnsupportedClaims("Safer than paraffin.", f).length).toBeGreaterThan(0);
  });
});

describe("legacy pages, nested as deeply as production nests them", () => {
  it("reads words out of a features grid's items", () => {
    const page = {
      id: "p-legacy", slug: "about", title: "About", page_type: "about", content_source: "generated",
      sections: [
        {
          type: "features_grid",
          heading: "Why our candles",
          items: [
            { title: "Cleaner burn", description: ABOUT_COMPARATIVE },
            { title: "Gifting", description: ABOUT_GIFTING },
          ],
        },
        { type: "faq", heading: "Questions", items: [{ question: "Is it safe?", answer: ABOUT_BETTER }] },
      ],
    };
    const flagged = reviewPage(page as any, factsWithoutGeneratedCopy(facts(), [] as any)).map((i) => i.sentence).join(" | ");
    // A reader that only looked at a legacy node's own flat fields saw
    // the heading and nothing else.
    expect(flagged).toContain("safer than mass-market paraffin");
    expect(flagged).toContain("burns better and safer");
  });

  it("does not mistake a URL or an alignment for words", () => {
    const page = {
      id: "p-legacy", slug: "about", title: "About", page_type: "about", content_source: "generated",
      sections: [{ type: "image_text", imageUrl: "https://cdn.test/a.jpg", imagePosition: "right", align: "center", background: "none", body: "Hand-poured in small batches." }],
    };
    const items = reviewPage(page as any, factsWithoutGeneratedCopy(facts(), [] as any));
    expect(items.map((i) => i.sentence).join(" ")).not.toContain("cdn.test");
    expect(items.map((i) => i.sentence).join(" ")).not.toContain("center");
  });
});

// ---- coverage, so silence is visible --------------------------------

describe("the card says what it looked at", () => {
  it("counts lines read and lines checked, per page", async () => {
    const { pageCoverage } = await import("@/lib/claims/siteClaimsReview");
    const home = pageCoverage(SITE[0] as any);
    expect(home).toMatchObject({ slug: "home", read: 3, checked: 3, ownerWritten: 0, unreadable: false });
  });

  it("separates lines the owner wrote from lines it skipped by accident", async () => {
    const { pageCoverage } = await import("@/lib/claims/siteClaimsReview");
    const page = productionPage("p-x", "about", "About", [{ type: "text", prop: "html", value: "<p>Mine.</p>" }]);
    (page.sections[0].children[0].children[0].children[0] as any).props._source = "edited";
    (page.sections[0].children[0].children[0].children[0] as any).props._edited = ["html"];
    const c = pageCoverage(page as any);
    // Read, and deliberately not checked — which is a different thing
    // from not read, and the card says which.
    expect(c).toMatchObject({ read: 1, checked: 0, ownerWritten: 1, unreadable: false });
  });

  it("says so when a page has blocks but no readable words", async () => {
    const { pageCoverage } = await import("@/lib/claims/siteClaimsReview");
    const page = { slug: "gallery", title: "Gallery", content_source: "generated", sections: [{ id: "s", type: "section", props: { background: "none" }, children: [{ id: "i", type: "image", props: { url: "https://cdn.test/a.jpg", alt: "" }, children: [] }] }] };
    // Not a claim that the page is clean: a claim that nothing was read.
    expect(pageCoverage(page as any)).toMatchObject({ read: 0, unreadable: true });
  });

  it("the card renders the breakdown and names the bug case", () => {
    const card = readFileSync("src/components/seo/ClaimsReview.tsx", "utf8");
    expect(card).toMatch(/Checked \{totals\.pages\}/);
    expect(card).toMatch(/of \{totals\.read\}/);
    expect(card).toMatch(/couldn't read any words out of/);
    expect(card).toMatch(/Lines you wrote yourself are skipped on purpose/);
  });
});

// ---- a contact detail the owner can claim ---------------------------

describe("a contact detail can be kept", () => {
  it("offers Keep on a contact item, which it did not", async () => {
    const page = productionPage("p-contact", "contact", "Contact", [
      { type: "text", prop: "html", value: "<p>Email candlesbyqaaaf@gmail.com for restock alerts.</p>" },
    ]);
    const item = reviewPage(page as any, factsWithoutGeneratedCopy(facts(), [] as any)).find((i) => i.kind === "contact");
    expect(item).toBeTruthy();
    // THE BUG: the contact scrub words its reason as `email address
    // "x@y.com" — this business has no…`, which does not BEGIN with a
    // quote, so claimPhraseOf returned null and keepable collapsed to
    // false. The owner's real email had only Edit and Remove.
    expect(item!.claim).toBe("candlesbyqaaaf@gmail.com");
    expect(item!.keepable).toBe(true);
  });

  it("stores it where the contact scrub will read it", () => {
    const route = readFileSync("src/app/api/seo/claims-review/route.ts", "utf8");
    // 'general' is one of the six categories the live CHECK allows, and
    // allowedContacts() reads ownerFacts' title and content — so the
    // value is permitted on every surface from the moment it is saved,
    // with no migration.
    expect(route).toMatch(/category: isContact \? "general" : "business_story"/);
    expect(route).toMatch(/title: isContact \? "Contact detail I confirmed is mine"/);
  });

  it("and the kept value then passes the scrub everywhere", async () => {
    const { scrubInventedContacts } = await import("@/lib/claims/guardBlocks");
    const f = facts();
    const before = scrubInventedContacts("Email candlesbyqaaaf@gmail.com to order.", f);
    expect(before.removed.length).toBeGreaterThan(0);

    // As Keep stores it: a business_knowledge row under 'general'.
    const after = scrubInventedContacts("Email candlesbyqaaaf@gmail.com to order.", {
      ...f,
      ownerFacts: [...(f.ownerFacts ?? []), { category: "general", title: "Contact detail I confirmed is mine", content: "candlesbyqaaaf@gmail.com" }] as any,
    });
    expect(after.removed).toEqual([]);
    expect(after.text).toContain("candlesbyqaaaf@gmail.com");
  });

  it("says 'it's mine' rather than 'it's true' for a contact", () => {
    const card = readFileSync("src/components/seo/ClaimsReview.tsx", "utf8");
    expect(card).toMatch(/item\.kinds\.includes\("contact"\) \? \(\s*<>Keep — it&apos;s mine<\/>/);
  });
});
