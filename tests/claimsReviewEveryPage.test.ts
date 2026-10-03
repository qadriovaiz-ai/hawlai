// The About page was never on the list.
//
// On candle_by_qaaf the "Claims on your site" card showed items from
// Home, Contact, Privacy and Terms — and nothing from About, which was
// live and said:
//
//   "burns slower, cleaner, and safer than mass-market paraffin"
//   "burns better and safer"
//   "Premium, personal packaging made for gifting — especially our
//    Diwali sets"
//
// read_page could see all three. The review could not, because it had
// its own walk: two readers of the same pages, and the one nobody was
// looking at went quiet. They are now one function, so a line the owner
// can be shown is a line the review checks.
//
// The second cause was provenance. `_source` was one mark for a whole
// block, and the builder sets it to "edited" when the owner changes any
// text prop — so editing a heading exempted the paragraph beside it from
// the review AND fed it into the evidence. A machine-written claim
// vouching for itself is the loop Stage 1 broke.

import { describe, it, expect, vi } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import { reviewPage } from "@/lib/claims/siteClaimsReview";
import { pageLines } from "@/lib/pages/readPage";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

// The live sentences, as the owner read them on their own site.
const ABOUT_COMPARATIVE = "Our soy wax burns slower, cleaner, and safer than mass-market paraffin.";
const ABOUT_BETTER = "It burns better and safer.";
const ABOUT_GIFTING = "Premium, personal packaging made for gifting — especially our Diwali sets.";
const HOME_SAFER = "Safer than mass-market paraffin, every time.";
const HOME_CLEAN = "Just clean burning candles, poured by hand.";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  const home = { slug: "home", pageType: "home", title: "Home", headings: [], paragraphs: [], buttons: [], metaDescription: null, hasShareImage: false };
  return {
    businessName: "candle_by_qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    // Deliberately EMPTY of the site's own copy: the review is measured
    // against facts the site cannot vouch for.
    site: { url: "/site/candle-by-qaaf", published: true, pages: [home] }, home,
    products: [{ id: "p1", name: "Lavender candle", price: 999, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 46, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 2.1, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 }, ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-03"), unreadable: [],
    ...over,
  } as BusinessFacts;
}

/** A block-shaped page, the way the builder stores one. */
const block = (id: string, type: string, props: Record<string, any>) => ({ id, type, props, children: [] });
const section = (id: string, children: any[]) => ({ id, type: "section", props: { _source: "generated" }, children });

/** The same words, in the shape a page had before the block builder. */
const legacy = (fields: Record<string, string>) => ({ type: "hero", ...fields });

const SITE = [
  {
    id: "p-home", slug: "home", title: "Home", page_type: "home",
    sections: [section("s1", [
      block("h1", "heading", { text: "Candles by Qaaf", _source: "generated" }),
      block("t1", "text", { html: `<p>${HOME_SAFER} ${HOME_CLEAN}</p>`, _source: "generated" }),
    ])],
  },
  {
    id: "p-about", slug: "about", title: "About", page_type: "about",
    sections: [section("s2", [
      block("h2", "heading", { text: "Our story", _source: "generated" }),
      block("t2", "text", { html: `<p>${ABOUT_COMPARATIVE} ${ABOUT_BETTER}</p>`, _source: "generated" }),
      block("t3", "text", { html: `<p>${ABOUT_GIFTING}</p>`, _source: "generated" }),
    ])],
  },
  {
    id: "p-contact", slug: "contact", title: "Contact", page_type: "contact",
    sections: [section("s3", [block("t4", "text", { html: "<p>Email hello@candlebyqaaf.com for restock alerts.</p>", _source: "generated" })])],
  },
  {
    id: "p-privacy", slug: "privacy-policy", title: "Privacy", page_type: "legal",
    sections: [section("s4", [block("t5", "text", { html: "<p>We keep order details for 7 years. Our candles are the safest in India.</p>", _source: "generated" })])],
  },
];

function allItems(pages: any[], f = facts()) {
  return pages.flatMap((page) => reviewPage(page, f));
}

describe("every page of the site reaches the list", () => {
  it("flags the About page, which it never did before", () => {
    const items = allItems(SITE);
    const about = items.filter((i) => i.pageSlug === "about");
    expect(about.length).toBeGreaterThan(0);
    const flagged = about.map((i) => i.sentence).join(" | ");
    expect(flagged).toContain("safer than mass-market paraffin");
    expect(flagged).toContain("burns better and safer");
  });

  it("flags Home's two lines as well", () => {
    const home = allItems(SITE).filter((i) => i.pageSlug === "home").map((i) => i.sentence).join(" | ");
    expect(home).toContain("Safer than mass-market paraffin");
    expect(home).toContain("clean burning");
  });

  it("reaches every page, not a subset of them", () => {
    // The actual failure was silence on one page out of five. So the
    // assertion is on the SET of pages, not on a count of items.
    const seen = new Set(allItems(SITE).map((i) => i.pageSlug));
    expect([...seen].sort()).toEqual(["about", "contact", "home", "privacy-policy"]);
  });

  it("sees exactly what read_page sees, on every page", () => {
    // THE STRUCTURAL GUARANTEE, and the reason the walk was rebuilt: if
    // the reader can show a line to the owner, the review checks it.
    for (const page of SITE) {
      const readable = pageLines(page.sections).map((l) => l.text);
      const reviewed = reviewPage(page, facts());
      for (const item of reviewed) {
        const covered = readable.some((text) => text.includes(item.sentence.trim().replace(/[.!?]+$/, "")));
        expect(covered, `${page.slug}: "${item.sentence}" is not in what read_page returns`).toBe(true);
      }
    }
  });
});

describe("the same pages in the shape they had before the block builder", () => {
  const LEGACY_SITE = [
    { id: "p-home", slug: "home", title: "Home", page_type: "home", sections: [legacy({ headline: "Candles by Qaaf", subheadline: `${HOME_SAFER} ${HOME_CLEAN}`, ctaText: "Shop now" })] },
    { id: "p-about", slug: "about", title: "About", page_type: "about", sections: [legacy({ heading: "Our story", body: `${ABOUT_COMPARATIVE} ${ABOUT_BETTER}` })] },
    { id: "p-contact", slug: "contact", title: "Contact", page_type: "contact", sections: [legacy({ body: "Email hello@candlebyqaaf.com for restock alerts." })] },
  ];

  it("flags the same lines with no block ids anywhere", () => {
    const items = allItems(LEGACY_SITE);
    const bySlug = (slug: string) => items.filter((i) => i.pageSlug === slug).map((i) => i.sentence).join(" | ");
    expect(bySlug("about")).toContain("safer than mass-market paraffin");
    expect(bySlug("home")).toContain("Safer than mass-market paraffin");
    expect(bySlug("contact")).toContain("hello@candlebyqaaf.com");
    // And the lines have no id to address, which is the honest state.
    expect(items.every((i) => i.blockId === null)).toBe(true);
  });

  it("read_page can see them too, so the two still agree", () => {
    const lines = pageLines(LEGACY_SITE[1].sections);
    expect(lines.map((l) => l.text).join(" ")).toContain("safer than mass-market paraffin");
    expect(lines.every((l) => l.blockId === null)).toBe(true);
  });
});

describe("provenance is per line, not per block", () => {
  it("editing a heading does not exempt the paragraph beside it", () => {
    // THE SECOND CAUSE, and the subtler one. One mark per block meant a
    // single heading edit in Website Builder silenced the review for
    // every other line in that block.
    const page = {
      id: "p-about", slug: "about", title: "About", page_type: "about",
      sections: [
        {
          id: "s", type: "section", props: {}, children: [
            // The owner retyped the heading. They did not write the
            // paragraph, which is still Hawlai's.
            { id: "b1", type: "text", props: { heading: "Our story", html: `<p>${ABOUT_COMPARATIVE}</p>`, _source: "edited", _edited: ["heading"] }, children: [] },
          ],
        },
      ],
    };
    const items = reviewPage(page, facts());
    expect(items.map((i) => i.sentence).join(" ")).toContain("safer than mass-market paraffin");
  });

  it("reviews a block marked edited with no record of WHICH line", () => {
    // THE STATE THE LIVE PAGES ARE ACTUALLY IN. Every block the builder
    // marked before per-prop marks existed says "edited" and nothing
    // more. That means "the owner has been in this block", which is not
    // the same claim as "the owner wrote every line in it" — and
    // treating the two as the same is what kept About off the list.
    //
    // Read strictly: a line wrongly re-flagged costs one decision on the
    // card, and anything already stood behind is in Business Knowledge
    // by then, so it is no longer unsupported and does not return. A
    // line wrongly exempted goes out unchecked and vouches for itself.
    const page = {
      id: "p-about", slug: "about", title: "About", page_type: "about",
      sections: [{ id: "s", type: "section", props: {}, children: [
        { id: "b1", type: "text", props: { html: `<p>${ABOUT_COMPARATIVE}</p>`, _source: "edited" }, children: [] },
      ] }],
    };
    expect(reviewPage(page, facts()).map((i) => i.sentence).join(" ")).toContain("safer than mass-market paraffin");
  });

  it("and does not take that block's words as evidence either", async () => {
    const { ownerWritten, blocksText } = await import("@/lib/claims/businessFacts");
    const sections = [{ id: "b1", type: "text", props: { html: `<p>${ABOUT_COMPARATIVE}</p>`, _source: "edited" } }];
    expect(blocksText(ownerWritten(sections)).paragraphs.join(" ")).not.toContain("safer than mass-market");
  });

  it("leaves a line the owner really wrote off the list", () => {
    const page = {
      id: "p-about", slug: "about", title: "About", page_type: "about",
      sections: [{ id: "s", type: "section", props: {}, children: [
        { id: "b1", type: "text", props: { html: `<p>${ABOUT_COMPARATIVE}</p>`, _source: "edited", _edited: ["html"] }, children: [] },
      ] }],
    };
    // Putting their own sentence on a review list would be telling them
    // their words need their approval.
    expect(reviewPage(page, facts())).toEqual([]);
  });

  it("does not treat a block the owner has merely been in as evidence", async () => {
    const { ownerWritten, blocksText } = await import("@/lib/claims/businessFacts");
    const sections = [{ id: "b1", type: "text", props: { heading: "Our story", html: `<p>${ABOUT_COMPARATIVE}</p>`, _source: "edited", _edited: ["heading"] } }];
    const kept = blocksText(ownerWritten(sections));
    expect(kept.headings.join(" ")).toContain("Our story");
    // The paragraph is Hawlai's, so it cannot be the proof of itself.
    expect(kept.paragraphs.join(" ")).not.toContain("safer than mass-market");
  });

  it("still treats a page from before any marking as the owner's", async () => {
    const { ownerWritten, blocksText } = await import("@/lib/claims/businessFacts");
    // No _source at all: their own site, which they have lived with.
    // Guessing against them would strip copy nobody asked to check.
    const sections = [{ id: "b1", type: "text", props: { html: "<p>An older line.</p>" } }];
    expect(blocksText(ownerWritten(sections)).paragraphs.join(" ")).toContain("An older line.");
  });
});
