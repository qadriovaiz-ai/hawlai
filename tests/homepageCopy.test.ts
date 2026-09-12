// "Update our homepage copy" must change the part of the page that was
// asked for — and must never report success for a different edit.
//
// TWO LIVE CASES (2026-09-12), both of which answered "✅ Updated your
// live homepage" while the site was unchanged or wrongly changed:
//
//   1. The tool wrote to the legacy `landing_pages` table. /site/{slug}
//      renders website_pages.sections, so the edit could never show
//      there — and with no landing_pages row the update matched ZERO
//      rows, which Supabase reports as success with error: null.
//   2. Then it only ever edited the HERO. Asked to rewrite "the Diwali
//      Gifting section below the hero", it rewrote the hero's supporting
//      line and still claimed the job was done.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyHomepageCopy, listSections } from "@/lib/chat/homepageCopy";

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

// candle_by_qaaf's real page shape: a hero, then a gifting section
// further down — the one the owner asked to rewrite.
const HOME_SECTIONS = [
  {
    id: "s1", type: "section", props: {},
    children: [
      { id: "h1", type: "heading", props: { text: "A mood, not just a candle.", level: 1 } },
      { id: "t1", type: "text", props: { html: "<p>Hand-poured soy wax candles.</p>" } },
      { id: "b1", type: "button", props: { label: "Shop the Collection", href: "/shop" } },
    ],
  },
  {
    id: "s2", type: "section", props: {},
    children: [
      { id: "h2", type: "heading", props: { text: "Light up your Diwali gifting", level: 2 } },
      { id: "t2", type: "text", props: { html: "<p>Gift sets for the festival of lights.</p>" } },
      { id: "b2", type: "button", props: { label: "See Diwali gifts", href: "/gifts" } },
    ],
  },
];

const CANDLE = (published = true): Record<string, Row[]> => ({
  profiles: [{ id: "u1", dealership_id: "d1" }],
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published }],
  website_pages: [{ id: "page1", website_id: "w1", slug: "home", sections: HOME_SECTIONS, updated_at: "2026-09-12T10:00:00Z" }],
  landing_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: [], inventory_count: 5, is_active: true, order_index: 0 }],
  discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
  business_knowledge: [], brand_profiles: [], brand_kits: [], team_members: [], business_memory: [],
});

let shopifyConnected = false;
// What Shopify's own search answers. The live failure happens HERE, not
// at the credentials: the store is connected, and simply has no product
// by that name because the product lives in the Hawlai store.
let shopifySearch: any = { ok: true, candidates: [] };
vi.mock("@/lib/publish/platforms/shopifySearch", () => ({
  searchShopifyVariants: async () => shopifySearch,
}));
vi.mock("@/lib/publish/platforms/shopifyCredentials", () => ({
  resolveShopifyCredentials: async () =>
    shopifyConnected
      ? { ok: true, shop: "candle.myshopify.com", accessToken: "tok" }
      : { ok: false, retryable: false, reason: "Shopify isn't connected for this business." },
  shopifyCredentialsAdapter: {},
}));
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
  shopifyConnected = false;
  shopifySearch = { ok: true, candidates: [] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the words are swapped in the blocks the site actually renders", () => {
  it("with no section named, the hero changes and nothing below it does", () => {
    const { sections, changed, sectionHeading } = applyHomepageCopy(HOME_SECTIONS, {
      headline: "Light up your Christmas.",
      subheadline: "Hand-poured candles for the season.",
      ctaText: "Shop Christmas",
    });

    expect(sections[0].children.map((c: any) => c.props.text ?? c.props.html ?? c.props.label)).toEqual([
      "Light up your Christmas.",
      "<p>Hand-poured candles for the season.</p>",
      "Shop Christmas",
    ]);
    // The gifting section below is untouched.
    expect(sections[1].children[0].props.text).toBe("Light up your Diwali gifting");
    expect(sections[1].children[2].props.label).toBe("See Diwali gifts");
    expect(sectionHeading).toBe("A mood, not just a candle.");
    expect(changed).toHaveLength(3);
  });

  it("a named section is the one that changes — the hero is left alone", () => {
    const { sections, changed, sectionHeading } = applyHomepageCopy(
      HOME_SECTIONS,
      { headline: "Light up your Christmas gifting", subheadline: "Gift sets for the season.", ctaText: "See Christmas gifts" },
      { section: "the Diwali Gifting section" }
    );

    expect(sections[1].children[0].props.text).toBe("Light up your Christmas gifting");
    expect(sections[1].children[1].props.html).toBe("<p>Gift sets for the season.</p>");
    expect(sections[1].children[2].props.label).toBe("See Christmas gifts");
    // The hero — which the old tool wrongly edited — is untouched.
    expect(sections[0].children[0].props.text).toBe("A mood, not just a candle.");
    expect(sections[0].children[1].props.html).toBe("<p>Hand-poured soy wax candles.</p>");
    expect(sectionHeading).toBe("Light up your Diwali gifting");
    expect(changed[0].from).toBe("Light up your Diwali gifting");
  });

  it("a section that isn't on the page changes nothing and reports the ones that are", () => {
    const r = applyHomepageCopy(HOME_SECTIONS, { headline: "New" }, { section: "the testimonials section" });
    expect(r.sectionNotFound).toBe(true);
    expect(r.changed).toEqual([]);
    expect(r.available).toEqual(["A mood, not just a candle.", "Light up your Diwali gifting"]);
  });

  it("lists the page's sections by their own headings", () => {
    expect(listSections(HOME_SECTIONS)).toEqual([
      { index: 0, heading: "A mood, not just a candle." },
      { index: 1, heading: "Light up your Diwali gifting" },
    ]);
  });

  it("never mutates the page it was given — the original is what's still live until approval", () => {
    applyHomepageCopy(HOME_SECTIONS, { headline: "Changed" }, { section: "Diwali" });
    expect(HOME_SECTIONS[1].children[0].props.text).toBe("Light up your Diwali gifting");
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
    expect(result).toMatchObject({ proposed: true, pageId: "page1", published: true, siteUrl: "/site/candle-by-qaaf" });
    expect(result.note).toMatch(/Nothing has changed yet/);
  });

  it("asked for the Diwali Gifting section, it proposes a change to THAT section", async () => {
    const input = { section: "the Diwali Gifting section below the hero", headline: "Light up your Christmas gifting" };
    const result = await run(input);
    const artifact = extractArtifact("update_landing_page", input, result)!;

    expect(result.sectionHeading).toBe("Light up your Diwali gifting");
    expect(result.note).toMatch(/"Light up your Diwali gifting" section/);
    expect(artifact.label).toMatch(/"Light up your Diwali gifting"/);
    expect(artifact.fields![0].value).toBe('"Light up your Diwali gifting" → "Light up your Christmas gifting"');
    expect((artifact.publish!.payload.sections as any)[0].children[0].props.text).toBe("A mood, not just a candle.");
  });

  it("a section it can't find is refused with the real section names — not a silent hero edit", async () => {
    const result = await run({ section: "the testimonials section", headline: "New" });
    expect(result.error).toMatch(/couldn't find a "the testimonials section" section/i);
    expect(result.error).toMatch(/"A mood, not just a candle.", "Light up your Diwali gifting"/);
    expect(writes).toEqual([]);
  });

  it("the card shows the old wording beside the new, and publishes through the page endpoint", async () => {
    const result = await run({ headline: "Light up your Christmas.", offerText: "Shop Christmas" });
    const artifact = extractArtifact("update_landing_page", {}, result)!;

    expect(artifact.fields).toEqual([
      { label: "Headline", value: '"A mood, not just a candle." → "Light up your Christmas."' },
      { label: "Button", value: '"Shop the Collection" → "Shop Christmas"' },
    ]);
    expect(artifact.publish).toMatchObject({ endpoint: "/api/website-builder/pages/page1", method: "PATCH" });
    expect(artifact.publish!.payload.expectedUpdatedAt).toBe("2026-09-12T10:00:00Z");
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

  it("a section with no editable text is an error, not a silent success", async () => {
    tables.website_pages = [{ id: "page1", website_id: "w1", slug: "home", sections: [{ id: "x", type: "image", props: { src: "a.png" } }], updated_at: "t" }];
    const result = await run({ headline: "New" });
    expect(result.error).toMatch(/couldn't find a heading, paragraph or button/i);
    expect(writes).toEqual([]);
  });

  it("asking for nothing changes nothing", async () => {
    expect((await run({})).error).toBe("Nothing to update");
    expect(writes).toEqual([]);
  });
});

describe("a price change for a product chat can see but the price tool cannot", () => {
  const priceChange = (phrase: string) =>
    executeTool(db(), CTX, "propose_price_change", { product_description: phrase, new_price: "999" }, "");

  it("THE LIVE CASE — Shopify is connected but has no such product: names the store it is actually in", async () => {
    shopifyConnected = true; // credentials resolve fine
    shopifySearch = { ok: true, candidates: [] }; // Shopify simply doesn't have it
    const result = await priceChange("lavender candle");

    expect(result.error).toMatch(/"Lavender candle" \(₹550\) is in your own Hawlai store/);
    expect(result.error).toMatch(/Website Builder → Products/);
    // The old message, which read as "that product doesn't exist".
    expect(result.error).not.toMatch(/Couldn't find a product matching/);
  });

  it("a Shopify search that fails outright says the same thing when the product is ours", async () => {
    shopifyConnected = true;
    shopifySearch = { ok: false, reason: "Shopify search failed (429)." };
    expect((await priceChange("lavender candle")).error).toMatch(/is in your own Hawlai store/);
  });

  it("with Shopify unconnected, it still names the store the product is in", async () => {
    shopifyConnected = false;
    expect((await priceChange("Lavender candle")).error).toMatch(/is in your own Hawlai store/);
  });

  it("a product in NEITHER store reports the real problem for that store", async () => {
    shopifyConnected = true;
    const result = await priceChange("Sandalwood diffuser");
    expect(result.error).toBe(`Couldn't find a product matching "Sandalwood diffuser" in your connected Shopify store.`);
  });

  it("with Shopify unconnected and no such product anywhere, the connection problem is reported", async () => {
    shopifyConnected = false;
    expect((await priceChange("Sandalwood diffuser")).error).toBe("Shopify isn't connected for this business.");
  });
});

