// The website builder writes claims like every other surface: checked.
//
// It was the last one that didn't, and the only one whose output becomes
// EVIDENCE — knownText() reads the business's own site, so a line the
// machine wrote there went on to approve the same claim everywhere else.
// "No paraffin. No synthetic shortcuts." reached a live homepage
// unchecked and from then on backed every future mention of paraffin.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { guardBlockTree, markGenerated, groundedHeading, groundedParagraph } from "@/lib/claims/guardBlocks";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [] }, home: null,
    products: [], offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 0, leads: 0 }, // On record, so copy repeating how the candles are made is backed
    // (materials joined CLAIM_TERMS on 2026-10-02).
    ownerFacts: [{ category: "business_story", title: "How our candles are made", content: "Hand-poured soy wax in small batches." } as any],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-09-30"), unreadable: [], ...over,
  } as BusinessFacts;
}

const withCatalogue = facts({
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Soy wax", images: [], inventory: null, category: null, active: true } as any],
});

const block = (type: string, props: Record<string, any>) => ({ id: `b-${type}`, type, props });
const textOf = (tree: any, key: string): string[] => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (n.props?.[key]) out.push(n.props[key]);
    walk(n.children);
  };
  walk(tree);
  return out;
};

describe("claims in generated page copy", () => {
  it("takes out what the business cannot back up", () => {
    const tree = [block("heading", { text: "India's most loved candle brand" })];
    const r = guardBlockTree(tree, facts());
    expect(r.removed.join(" ")).toMatch(/superlative/);
    expect(textOf(r.blocks, "text")[0]).not.toMatch(/most loved/);
  });

  it("leaves alone what it can", () => {
    const tree = [block("heading", { text: "Hand-poured candles from Shahjahanpur" })];
    const r = guardBlockTree(tree, facts());
    expect(textOf(r.blocks, "text")[0]).toBe("Hand-poured candles from Shahjahanpur");
    expect(r.removed).toEqual([]);
  });

  it("REBUILDS a line that loses everything, rather than publishing a blank one", () => {
    const tree = [block("heading", { text: "India's most loved candle brand" })];
    const r = guardBlockTree(tree, facts());
    // An empty hero is not a safer page; it is a broken one the owner
    // cannot explain. The replacement uses only counted facts.
    expect(textOf(r.blocks, "text")[0]).toBe("Home fragrance in Shahjahanpur");
    expect(r.replaced).toBe(1);
  });

  it("does not leave a closing tag behind when a paragraph goes", () => {
    // stripUnsupported works on sentences, so "<p>Rated 4.9/5.</p>"
    // came back as "</p>" — not empty, not words either. Trusting
    // .trim() there published a block whose whole content was markup.
    const tree = [block("text", { html: "<p>Rated 4.9/5. Thousands of happy customers.</p>" })];
    const r = guardBlockTree(tree, withCatalogue);
    const html = textOf(r.blocks, "html")[0];
    expect(html).not.toBe("</p>");
    expect(html).toBe("<p>Made in Shahjahanpur. Lavender candle (₹550).</p>");
  });

  it("builds the replacement from the real catalogue when there is one", () => {
    expect(groundedParagraph(withCatalogue)).toBe("Made in Shahjahanpur. Lavender candle (₹550).");
    expect(groundedHeading(facts())).toBe("Home fragrance in Shahjahanpur");
    // Nothing on record at all still says something true.
    expect(groundedParagraph(facts({ city: null }))).toBe("Get in touch with Candle by Qaaf.");
  });

  it("touches only the words, never the wiring", () => {
    // Guarding the whole object would rewrite hrefs, alignments and
    // background tokens. A stripped href is a broken link, not a safer
    // page.
    const tree = [{ id: "b1", type: "button", props: { label: "India's best candles", href: "/shop", align: "center", background: "none" } }];
    const r: any = guardBlockTree(tree, facts());
    expect(r.blocks[0].props.href).toBe("/shop");
    expect(r.blocks[0].props.align).toBe("center");
    expect(r.blocks[0].props.background).toBe("none");
    expect(r.blocks[0].id).toBe("b1");
    expect(r.blocks[0].props.label).toBe("Get in touch");
  });

  it("reaches into children, where most copy actually lives", () => {
    const tree = [{ id: "s", type: "section", props: {}, children: [block("heading", { text: "India's most loved candle brand" })] }];
    expect(textOf(guardBlockTree(tree, facts()).blocks, "text")[0]).toBe("Home fragrance in Shahjahanpur");
  });

  it("changes nothing when there are no facts to check against", () => {
    const tree = [block("heading", { text: "India's most loved candle brand" })];
    expect(guardBlockTree(tree, null)).toEqual({ blocks: tree, removed: [], replaced: 0 });
  });
});

describe("who wrote each line", () => {
  it("marks every generated block, children included", () => {
    const tree: any = markGenerated([{ id: "s", type: "section", props: {}, children: [block("heading", { text: "Hello" })] }]);
    expect(tree[0].props._source).toBe("generated");
    expect(tree[0].children[0].props._source).toBe("generated");
  });

  it("the builder guards and marks before the pages become a website", () => {
    const builder = readFileSync("src/lib/agents/websiteBuilderAgent.ts", "utf8");
    expect(builder).toMatch(/guardBlockTree\(page\.sections, facts, "publish"\)/);
    expect(builder).toMatch(/markGenerated\(guarded\.blocks\)/);
  });

  it("both real call sites pass the business's facts", () => {
    expect(readFileSync("src/app/api/website-builder/generate/route.ts", "utf8")).toMatch(/factsPrompt\(facts\), facts\)/);
    expect(readFileSync("src/lib/agents/masterBrainV2.ts", "utf8")).toMatch(/generateWebsite\([^)]*await factsFor\(supabase, ctx\)\)/);
  });

  it("an owner's save makes the page theirs — when it changed the words", () => {
    // Narrowed after Stage 1: saving the page from Website Builder sends
    // the sections even when the owner only set a share image, so the
    // flip is conditional on the words having changed. The full rule and
    // its mutations live in tests/contentSourceScope.test.ts.
    const route = readFileSync("src/app/api/website-builder/pages/[id]/route.ts", "utf8");
    expect(route).toMatch(/if \(wordsChanged\(current\?\.sections, body\.sections\)\) update\.content_source = "edited";/);
    const panel = readFileSync("src/components/website-builder/blocks/PropertiesPanel.tsx", "utf8");
    expect(panel).toMatch(/TEXT_PROPS\.has\(key\) \? \{ \[key\]: value, _source: "edited" \}/);
  });
});
