// "Update our homepage copy" must change the page the site renders —
// and must not claim it did anything until the owner approves.
//
// THE LIVE CASE (2026-09-12): chat's update_landing_page tool wrote
// headline/subheadline/offer_text to the legacy `landing_pages` table
// and replied "✅ Saved to your live landing page — changes are live
// immediately". Two separate failures:
//   1. /site/{slug} renders website_pages.sections, NOT landing_pages,
//      so the change could never appear where the owner looked.
//   2. candle_by_qaaf has no landing_pages row at all, so the update
//      matched zero rows — which Supabase reports as success with
//      error: null. Nothing was written anywhere.
// And it bypassed the approval flow entirely: no preview, no confirm.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyHomepageCopy } from "@/lib/chat/homepageCopy";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, ilike: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      update: (v: Row) => ((op = "update"), (values = v), writes.push({ table, op, values: v }), api),
      insert: (v: Row) => ((op = "insert"), (values = v), writes.push({ table, op, values: v }), api),
      delete: () => ((op = "delete"), api),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

// The real shape of candle_by_qaaf's home page: a block tree, and an
// EMPTY landing_pages table — the row the old tool tried to update.
const HOME_SECTIONS = [
  {
    id: "s1", type: "section", props: {},
    children: [
      { id: "h1", type: "heading", props: { text: "A mood, not just a candle.", level: 1 } },
      { id: "t1", type: "text", props: { html: "<p>Hand-poured soy wax candles.</p>" } },
      { id: "b1", type: "button", props: { label: "Shop the Collection", href: "/shop" } },
      { id: "h2", type: "heading", props: { text: "Diwali gifting", level: 2 } },
      { id: "b2", type: "button", props: { label: "See gifts", href: "/gifts" } },
    ],
  },
];

const CANDLE = (published = true): Record<string, Row[]> => ({
  profiles: [{ id: "u1", dealership_id: "d1" }],
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published }],
  website_pages: [{ id: "page1", website_id: "w1", slug: "home", sections: HOME_SECTIONS, updated_at: "2026-09-12T10:00:00Z" }],
  landing_pages: [],
  products: [], discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
  business_knowledge: [], brand_profiles: [], brand_kits: [], team_members: [], business_memory: [],
});

vi.mock("@/lib/usage/generationLimits", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/generationLimits")>()),
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
}));
vi.mock("@/lib/plans", async (orig) => ({
  ...(await orig<typeof import("@/lib/plans")>()),
  getDealershipPlanLimits: async () => ({}),
  hasFeature: () => true,
  killSwitchFor: () => null,
}));

import { executeTool, extractArtifact } from "@/lib/agents/masterBrainV2";

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [], facts: null };
const run = (input: Row) => executeTool(db(), CTX, "update_landing_page", input, "");

beforeEach(() => {
  tables = CANDLE();
  writes = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the words are swapped in the blocks the site actually renders", () => {
  it("replaces the hero headline, its supporting line and its button — and nothing else", () => {
    const { sections, changed } = applyHomepageCopy(HOME_SECTIONS, {
      headline: "Light up your Christmas.",
      subheadline: "Hand-poured candles for the season.",
      ctaText: "Shop Christmas",
    });

    const kids = sections[0].children;
    expect(kids[0].props.text).toBe("Light up your Christmas.");
    expect(kids[1].props.html).toBe("<p>Hand-poured candles for the season.</p>");
    expect(kids[2].props.label).toBe("Shop Christmas");
    // The second heading and second button are left alone.
    expect(kids[3].props.text).toBe("Diwali gifting");
    expect(kids[4].props.label).toBe("See gifts");
    expect(changed).toEqual([
      { field: "headline", from: "A mood, not just a candle.", to: "Light up your Christmas." },
      { field: "subheadline", from: "Hand-poured soy wax candles.", to: "Hand-poured candles for the season." },
      { field: "ctaText", from: "Shop the Collection", to: "Shop Christmas" },
    ]);
  });

  it("never mutates the page it was given — the original is what's still live until approval", () => {
    applyHomepageCopy(HOME_SECTIONS, { headline: "Changed" });
    expect(HOME_SECTIONS[0].children[0].props.text).toBe("A mood, not just a candle.");
  });

  it("only the requested field changes", () => {
    const { changed } = applyHomepageCopy(HOME_SECTIONS, { headline: "Just this" });
    expect(changed.map((c) => c.field)).toEqual(["headline"]);
  });

  it("pages from before the block builder still work", () => {
    const legacy = [{ type: "hero", headline: "Old", subheadline: "Old sub", ctaText: "Call us" }];
    const { sections, changed } = applyHomepageCopy(legacy, { headline: "New", ctaText: "Shop now" });
    expect(sections[0]).toMatchObject({ headline: "New", ctaText: "Shop now", subheadline: "Old sub" });
    expect(changed).toHaveLength(2);
  });

  it("a page with nothing to change reports no changes rather than inventing one", () => {
    expect(applyHomepageCopy([{ id: "x", type: "image", props: { src: "a.png" } }], { headline: "New" }).changed).toEqual([]);
  });
});

describe("the chat tool proposes — it no longer writes", () => {
  it("writes NOTHING, and never touches the legacy landing_pages table again", async () => {
    const result = await run({ headline: "Light up your Christmas." });

    expect(writes).toEqual([]); // the bug: this used to be a landing_pages update
    expect(writes.some((w) => w.table === "landing_pages")).toBe(false);
    expect(result).toMatchObject({ proposed: true, pageId: "page1", published: true, siteUrl: "/site/candle-by-qaaf" });
    expect(result.note).toMatch(/Nothing has changed yet/);
  });

  it("the card shows the old wording beside the new, and publishes through the page endpoint", async () => {
    const result = await run({ headline: "Light up your Christmas.", offerText: "Shop Christmas" });
    const artifact = extractArtifact("update_landing_page", { headline: "Light up your Christmas." }, result)!;

    expect(artifact.fields).toEqual([
      { label: "Headline", value: '"A mood, not just a candle." → "Light up your Christmas."' },
      { label: "Button", value: '"Shop the Collection" → "Shop Christmas"' },
    ]);
    expect(artifact.publish).toMatchObject({ endpoint: "/api/website-builder/pages/page1", method: "PATCH" });
    expect(artifact.publish!.payload.expectedUpdatedAt).toBe("2026-09-12T10:00:00Z");
    expect((artifact.publish!.payload.sections as any)[0].children[0].props.text).toBe("Light up your Christmas.");
  });

  it("on a published site the confirm says it goes live immediately", async () => {
    const artifact = extractArtifact("update_landing_page", {}, await run({ headline: "New" }))!;
    expect(artifact.publish!.confirm).toMatch(/LIVE homepage.*straight away/);
    expect(artifact.publish!.done).toBe("✅ Updated your live homepage");
  });

  it("on an unpublished site it says the site isn't public yet", async () => {
    tables = CANDLE(false);
    const artifact = extractArtifact("update_landing_page", {}, await run({ headline: "New" }))!;
    expect(artifact.publish!.confirm).toMatch(/isn't published yet/);
    expect(artifact.publish!.done).toBe("✅ Updated your homepage draft");
  });

  it("no website at all: says so plainly instead of writing somewhere invisible", async () => {
    tables.websites = [];
    const result = await run({ headline: "New" });
    expect(result.error).toMatch(/no website built yet/);
    expect(writes).toEqual([]);
  });

  it("a home page with no editable blocks is an error, not a silent success", async () => {
    tables.website_pages = [{ id: "page1", website_id: "w1", slug: "home", sections: [{ id: "x", type: "image", props: { src: "a.png" } }], updated_at: "t" }];
    const result = await run({ headline: "New" });
    expect(result.error).toMatch(/couldn't find a headline, subheadline or button block/i);
    expect(writes).toEqual([]);
  });

  it("asking for nothing changes nothing", async () => {
    expect((await run({})).error).toBe("Nothing to update");
    expect(writes).toEqual([]);
  });
});
