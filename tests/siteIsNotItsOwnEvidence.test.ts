// A page Hawlai wrote is never the proof that what it says is true.
//
// THE LOOP. The claims guard checks copy against what the business says
// about itself, and knownText() includes the website. websiteBuilderAgent
// wrote that website. So an invented line became the evidence that
// approved the same line everywhere else — "safer than mass-market
// paraffin" proved itself on 3 October 2026.
//
// Stage 2 excluded the machine's writing, but GATED the exclusion on
// dealerships.claims_reviewed_at. Confirmed live on 22 November 2026:
// this business has never completed the review, so the gate had never
// once closed, and "No synthetic shortcuts." has sat on its home page
// since 20 September backing itself.
//
// TWO NO-OPS WERE HIDING BEHIND THAT GATE, and both are pinned below,
// because closing the gate alone would have changed nothing for the very
// site that prompted it:
//
//   1. businessFacts never SELECTED website_pages.content_source, so it
//      could not pass it to ownerWritten. These blocks carry no
//      `_source` at all — they predate per-block marking — and without
//      the page's own mark, reading the block alone makes the copy the
//      owner's. siteClaimsReview has passed content_source all along.
//   2. ownerWritten returned a LEGACY block (no `props` object) whole.
//      blocksText reads a legacy block's `headline` and `subheadline`
//      directly, so that text went back into the evidence set however
//      the page was marked — on any page the bulk block migration never
//      converted.
//
// WHAT THIS FILE IS NOT. It does not claim the loop caused the
// 21 November "no shortcuts" slip. It did not: a probe on 22 November
// showed "no shortcuts" is flagged identically with and without the site
// as evidence, because CLAIM_SYNONYMS has no shortcuts family and
// "no synthetic shortcuts" does not contain "no shortcuts" as a
// substring. The loop is a separate, real defect found while looking for
// that one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gatherBusinessFacts, knownText, ownerWritten, blocksText } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims } from "@/lib/claims/claimCheck";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    // .eq() filters are applied for real — otherwise "active only" would
    // pass whether or not the code filters at all.
    //
    // AND SO IS .select(). A fake that hands back whole rows cannot see a
    // column the code forgot to ask for: dropping `content_source` from
    // the real select is invisible, and a mutation doing exactly that
    // SURVIVED this file on 22 November 2026 while all thirteen tests
    // passed. Same lesson as growthAudit's fake ignoring every `gte:`
    // for months — a double that ignores what it is given is not testing
    // the query.
    const filters: [string, any][] = [];
    let columns: string[] | null = null;
    const project = (r: Row) =>
      columns === null ? r : Object.fromEntries(columns.filter((c) => c in r).map((c) => [c, r[c]]));
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v)).map(project);
    const api: any = {
      select: (cols?: string) => {
        const list = String(cols ?? "*").split(",").map((c) => c.trim()).filter(Boolean);
        columns = list.includes("*") ? null : list;
        return api;
      },
      gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

/** The claim under test, in the owner's own trade words, said nowhere on record. */
const CLAIM = "Made in small batches.";
const ON_THE_PAGE = "Made in small batches.";

/** A legacy flat block — no `props` object, the shape from before the block builder. */
const LEGACY = (text: string) => [{ type: "hero", headline: "Welcome", subheadline: text }];

/** A block-builder block, with whatever provenance marks the case needs. */
const BLOCK = (text: string, marks: Row = {}) => [{ id: "b1", type: "text", props: { html: text, ...marks } }];

function base(over: { pages?: Row[]; reviewedAt?: string | null; knowledge?: Row[] } = {}): void {
  tables = {
    dealerships: [{ id: "d1", dealership_name: "A test business", business_category: "Home fragrance", city: "Lucknow", claims_reviewed_at: over.reviewedAt ?? null }],
    websites: [{ id: "w1", slug: "a-test-business", published: true, shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }],
    website_pages: over.pages ?? [],
    products: [{ id: "p1", name: "A scented item", price: 550, description: "Poured by hand.", images: [], inventory_count: 5, category: null, is_active: true, order_index: 0 }],
    discount_codes: [],
    orders: [],
    leads: [],
    page_events: [],
    abandoned_carts: [],
    business_knowledge: over.knowledge ?? [],
    brand_profiles: [],
    brand_kits: [],
    team_members: [],
    business_memory: [],
    interview_answers: [],
    seasonal_events: [],
  };
}

beforeEach(() => {
  base();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const page = (sections: Row[], contentSource: string | null) => [
  { slug: "home", page_type: "home", title: "Home", sections, content_source: contentSource, order_index: 0, meta_description: null, og_image_url: null },
];

async function evidence(sections: Row[], contentSource: string | null, reviewedAt: string | null = null): Promise<string> {
  base({ pages: page(sections, contentSource), reviewedAt });
  return knownText(await gatherBusinessFacts(db(), "d1"));
}

async function flagged(sections: Row[], contentSource: string | null, reviewedAt: string | null = null): Promise<string> {
  base({ pages: page(sections, contentSource), reviewedAt });
  return findUnsupportedClaims(CLAIM, await gatherBusinessFacts(db(), "d1")).join(" | ");
}

describe("1. A GENERATED PAGE IS NOT EVIDENCE, review or no review", () => {
  it("THE LOAD-BEARING ONE: a legacy block on a generated page, with the review never done", async () => {
    // The live shape: claims_reviewed_at null, content_source
    // 'generated', and sections from before the block builder.
    expect(await evidence(LEGACY(ON_THE_PAGE), "generated", null)).not.toContain("small batch");
    expect(await flagged(LEGACY(ON_THE_PAGE), "generated", null)).toMatch(/small batch/i);
  });

  it("a block-builder block marked generated is not evidence either", async () => {
    expect(await evidence(BLOCK(ON_THE_PAGE, { _source: "generated" }), "generated", null)).not.toContain("small batch");
  });

  it("AND AN UNMARKED BLOCK ON A GENERATED PAGE — the shape this business actually has", async () => {
    // No `_source` on the block at all, because it predates per-block
    // marking. The page's own mark is the only authority, and
    // businessFacts could not read it until content_source was selected.
    expect(await evidence(BLOCK(ON_THE_PAGE), "generated", null)).not.toContain("small batch");
  });

  it("THE GATE IS GONE: completing the review changes nothing about this", async () => {
    // Not vacuous — it used to be the whole switch.
    const never = await evidence(LEGACY(ON_THE_PAGE), "generated", null);
    const done = await evidence(LEGACY(ON_THE_PAGE), "generated", "2026-11-01T00:00:00Z");
    expect(never).not.toContain("small batch");
    expect(done).not.toContain("small batch");
  });
});

describe("2. THE OWNER'S OWN WORDS ARE STILL EVIDENCE, so this is an exclusion and not a deletion", () => {
  it("a page the owner has edited still counts", async () => {
    // The direction that proves the tests above are not passing because
    // the site is simply never read.
    expect(await evidence(LEGACY(ON_THE_PAGE), "edited", null)).toContain("small batch");
    expect(await flagged(LEGACY(ON_THE_PAGE), "edited", null)).not.toMatch(/small batch/i);
  });

  it("a prop the owner typed counts even on a generated page", async () => {
    const marked = BLOCK(ON_THE_PAGE, { _source: "edited", _edited: ["html"] });
    expect(await evidence(marked, "generated", null)).toContain("small batch");
  });

  it("an unmarked page is left alone — their own site, which they have lived with", async () => {
    expect(await evidence(LEGACY(ON_THE_PAGE), null, null)).toContain("small batch");
  });

  it("and Business Knowledge is untouched by any of this", async () => {
    base({
      pages: page(LEGACY(ON_THE_PAGE), "generated"),
      knowledge: [{ category: "general", title: "How we make them", content: "Every piece is made in small batches, a few at a time.", is_active: true }],
    });
    const f = await gatherBusinessFacts(db(), "d1");
    expect(knownText(f)).toContain("small batch");
    expect(findUnsupportedClaims(CLAIM, f).join(" | ")).not.toMatch(/small batch/i);
  });
});

describe("3. ownerWritten on its own — the legacy branch that used to return the block whole", () => {
  it("drops a legacy block's words on a generated page", () => {
    const kept = blocksText(ownerWritten(LEGACY(ON_THE_PAGE), "generated"));
    expect([...kept.headings, ...kept.paragraphs, ...kept.buttons].join(" ")).not.toContain("small batch");
  });

  it("keeps them when the page is the owner's", () => {
    const kept = blocksText(ownerWritten(LEGACY(ON_THE_PAGE), "edited"));
    expect(kept.paragraphs.join(" ")).toContain("small batch");
  });

  it("keeps the block itself, so structure survives and only words go", () => {
    // Returned as null, a legacy section would vanish from every other
    // reader of this function.
    const out = ownerWritten(LEGACY(ON_THE_PAGE), "generated") as Row[];
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("hero");
  });

  it("and a legacy block's heading goes too, not only its body", () => {
    // LEGACY_HEADING_KEYS and LEGACY_BUTTON_KEYS are read by blocksText
    // exactly as LEGACY_TEXT_KEYS is; dropping one list is a half fix.
    const section = [{ type: "hero", headline: ON_THE_PAGE, ctaText: ON_THE_PAGE }];
    const kept = blocksText(ownerWritten(section, "generated"));
    expect(kept.headings.join(" ")).not.toContain("small batch");
    expect(kept.buttons.join(" ")).not.toContain("small batch");
  });
});

describe("4. rule 3 — nothing here names a business, product or trade", () => {
  it("the fixtures carry no tenant vocabulary into the guard", () => {
    const forbidden = /candle|qaaf|kurta|dealership|salon|bakery|paraffin/i;
    expect(JSON.stringify([CLAIM, ON_THE_PAGE, LEGACY("x"), BLOCK("x")])).not.toMatch(forbidden);
  });
});
