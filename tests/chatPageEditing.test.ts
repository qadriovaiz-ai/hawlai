// Chat can change the words on a page, by pointing at them.
//
// WHAT THIS REPLACES: update_landing_page took a headline, a subheadline
// and a button label, matched a section by its heading, and edited the
// first heading/paragraph/button inside it. Homepage only, three fields
// only, and no way to refer to a line it had not been handed — so
// "isko chhota karo" had nothing to shorten and "ye line hata do" had
// nothing to remove. Asked to rewrite a named section it could not find,
// an earlier version rewrote the hero and reported success.
//
// Now read_page returns every line with the block id that identifies it,
// and edit_page_text changes the line at that address, through
// publish_actions with the approval card, the staleness check and a live
// read-back. Three things it must never do, each tested below: write
// seo_title or meta_description, mark a Hawlai draft as the owner's
// work, or quietly shorten a legal page.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
process.env.NEXT_PUBLIC_SITE_URL = "https://hawlai.online";

// ---- the page, as the block builder really stores one -----------------

const hero = () => [
  {
    id: "s1",
    type: "section",
    props: { background: "dark", _source: "generated" },
    children: [
      { id: "h1", type: "heading", props: { text: "Candles by Qaaf", level: 1, _source: "generated" }, children: [] },
      { id: "t1", type: "text", props: { html: "Small-batch soy candles, poured by hand.", _source: "generated" }, children: [] },
      { id: "b1", type: "button", props: { label: "Shop now", href: "/shop", _source: "generated" }, children: [] },
    ],
  },
];

const HOME_FACT = { slug: "home", pageType: "home", title: "Home", headings: ["Candles by Qaaf"], paragraphs: ["Small-batch soy candles."], buttons: ["Shop now"], metaDescription: null, hasShareImage: false };

function facts(): BusinessFacts {
  return {
    businessName: "candle_by_qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [HOME_FACT] }, home: HOME_FACT,
    products: [{ id: "p1", name: "Lavender candle", price: 999, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 46, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 2.1, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 }, ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-03"), unreadable: [],
  } as BusinessFacts;
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => serviceDb() }));
vi.mock("@/lib/claims/businessFacts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/claims/businessFacts")>();
  return { ...original, gatherBusinessFactsSafely: async () => facts() };
});

const created: any[] = [];
vi.mock("@/lib/publish/create", () => ({
  createPublishAction: async (_s: any, platform: any, input: any) => {
    created.push(input);
    // The REAL preview runs, so what the card would show is what is
    // asserted on — a card built from the tool's intent rather than from
    // the page is the failure this whole path exists to avoid.
    const preview = await platform.preview({
      id: "a1",
      dealershipId: input.dealershipId,
      platform: input.platform,
      actionKey: input.actionKey,
      targetRef: input.targetRef,
      requestedChanges: input.requestedChanges,
      resolutionPath: input.resolutionPath,
    });
    if (!preview.ok) return { ok: false, reason: preview.reason };
    return { ok: true, actionId: "a1", approvalId: "ap1", preview: preview.preview };
  },
}));

// ---- the database ------------------------------------------------------

let pages: any[];
let site: any;
let actions: any[];
const writes: any[] = [];

function serviceDb(): any {
  return db();
}

function db(): any {
  return {
    from(table: string) {
      let cols = "";
      const filters: Record<string, any> = {};
      const chain: any = {
        select(c?: string) { cols = c ?? ""; return chain; },
        eq(col: string, value: any) { filters[col] = value; return chain; },
        order() { return chain; },
        limit(n: number) {
          if (table === "publish_actions") return Promise.resolve({ data: actions.slice(0, n) });
          return chain;
        },
        update(values: any) { writes.push({ table, values, filters: { ...filters } }); return chain; },
        async maybeSingle() {
          if (table === "websites") {
            if (filters.id && filters.id !== site.id) return { data: null };
            return { data: site };
          }
          if (table === "website_pages") {
            const row = pages.find((p) => p.id === filters.id);
            return { data: row ? { ...row, website_id: site.id } : null, error: null };
          }
          if (table === "dealerships") return { data: { plan: "pro" } };
          return { data: null };
        },
        async single() { return { data: null, error: null }; },
        then(resolve: any) {
          // A bare `await supabase.from(x).select(y).eq(...)`.
          if (table === "website_pages") return resolve({ data: pages.map((p) => ({ ...p, website_id: site.id })) });
          return resolve({ data: [] });
        },
      };
      return chain;
    },
  };
}

beforeEach(() => {
  pages = [
    { id: "p1", slug: "home", title: "Home", page_type: "home", sections: hero(), content_source: "generated", seo_title: "Candle by Qaaf", meta_description: "Hand-poured candles." },
    { id: "p2", slug: "about", title: "About", page_type: "about", sections: [{ id: "s2", type: "section", props: {}, children: [{ id: "h2", type: "heading", props: { text: "Our story" }, children: [] }] }], content_source: "generated" },
    { id: "p3", slug: "privacy-policy", title: "Privacy", page_type: "legal", sections: [{ id: "s3", type: "section", props: {}, children: [{ id: "t3", type: "text", props: { html: "We keep your order details for 7 years as required by law. We never sell your data." }, children: [] }] }], content_source: "generated" },
    // A real shop page: prose at the top, the catalogue underneath.
    { id: "p4", slug: "products", title: "Shop", page_type: "products", sections: [{ id: "s4", type: "section", props: {}, children: [
      { id: "h4", type: "heading", props: { text: "The Shop" }, children: [] },
      { id: "t4", type: "text", props: { html: "Everything we pour, in one place." }, children: [] },
      { id: "g4", type: "product_catalog", props: { heading: "All candles" }, children: [
        { id: "pc1", type: "heading", props: { text: "Lavender candle" }, children: [] },
      ] },
    ] }], content_source: "generated" },
    { id: "p5", slug: "old", title: "Old", page_type: "custom", sections: [{ type: "hero", headline: "A mood, not just a candle.", subheadline: "Poured by hand.", ctaText: "Shop the Collection" }], content_source: "generated" },
  ];
  site = { id: "w1", slug: "candle-by-qaaf", published: true, dealership_id: "d1" };
  actions = [];
  created.length = 0;
  writes.length = 0;
});

const CTX: any = { id: "d1", name: "Candle by Qaaf", city: "Shahjahanpur", category: "candles", team: [], toneOfVoice: null };

async function tool(name: string, input: any) {
  const { executeTool } = await import("@/lib/agents/masterBrainV2");
  return executeTool(db(), CTX, name, input, "");
}

// ---- B1: reading a page ----------------------------------------------

describe("read_page gives every line an address", () => {
  it("returns the current text with block ids and what kind of line it is", async () => {
    const r: any = await tool("read_page", { page: "home" });
    expect(r.lines).toEqual([
      { blockId: "h1", prop: "text", blockType: "heading", text: "Candles by Qaaf", source: "generated", catalogueDriven: false },
      { blockId: "t1", prop: "html", blockType: "text", text: "Small-batch soy candles, poured by hand.", source: "generated", catalogueDriven: false },
      { blockId: "b1", prop: "label", blockType: "button", text: "Shop now", source: "generated", catalogueDriven: false },
    ]);
    expect(r.url).toBe("/site/candle-by-qaaf");
    expect(r.published).toBe(true);
  });

  it("lists the pages that exist when asked for one that doesn't", async () => {
    // The predecessor fell through to the hero and reported success.
    const r: any = await tool("read_page", { page: "diwali-gifting" });
    expect(r.needs_clarification).toBe(true);
    expect((r.candidates ?? []).map((c: any) => c.page)).toContain("about");
    expect(r.lines).toBeUndefined();
  });

  it("marks a legal page, and says which shop lines are editable and which aren't", async () => {
    expect((await tool("read_page", { page: "privacy-policy" }) as any).legal).toBe(true);
    const shop: any = await tool("read_page", { page: "products" });

    // CONSISTENT WORDING. The note used to invite the model to use the
    // blockIds and, in the same sentence, say edits were refused — so
    // the chat asked the owner for wording it would then turn down.
    expect(shop.note).toMatch(/ordinary text you can change/);
    expect(shop.note).toMatch(/marked catalogueDriven/);
    expect(shop.note).toMatch(/do NOT ask for replacement wording/i);

    const by = (id: string) => shop.lines.find((l: any) => l.blockId === id);
    expect(by("h4").catalogueDriven).toBe(false);
    expect(by("t4").catalogueDriven).toBe(false);
    // The grid, and anything inside it — a heading in a product card
    // belongs to the catalogue however ordinary its block type looks.
    expect(by("g4").catalogueDriven).toBe(true);
    expect(by("pc1").catalogueDriven).toBe(true);
  });

  it("writes nothing", async () => {
    await tool("read_page", { page: "home" });
    expect(writes).toEqual([]);
  });
});

// ---- the legacy conversion -------------------------------------------

describe("a page from before the block builder gets ids", () => {
  it("converts on first read and saves them, so the address is stable", async () => {
    const r: any = await tool("read_page", { page: "old" });
    // Flat legacy nodes carry no id, so nothing on them could be
    // addressed — the same gap that hid these pages from the claims walk.
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.lines.every((l: any) => typeof l.blockId === "string" && l.blockId.length > 0)).toBe(true);
    expect(r.lines.map((l: any) => l.text)).toContain("A mood, not just a candle.");

    const saved = writes.find((w) => w.table === "website_pages");
    expect(saved).toBeTruthy();
    // CONVERTING THE STORAGE SHAPE IS NOT AUTHORSHIP of the words.
    expect(saved.values.content_source).toBeUndefined();
    expect(saved.values.sections).toBeTruthy();
  });
});

// ---- B2: editing ------------------------------------------------------

describe("edit_page_text changes the line it was pointed at", () => {
  it("shows the real before and after, per line, and nothing is live yet", async () => {
    const r: any = await tool("edit_page_text", {
      page: "home",
      edits: [{ blockId: "t1", prop: "html", text: "Hand-poured soy candles, made in Shahjahanpur." }],
    });
    expect(r.success).toBe(true);
    expect(r.changed).toEqual([{ what: "text", from: "Small-batch soy candles, poured by hand.", to: "Hand-poured soy candles, made in Shahjahanpur." }]);
    expect(r.note).toMatch(/nothing on the page has changed yet/i);
    // Through publish_actions, on the platform — not a publish path of
    // chat's own.
    expect(created[0].platform).toBe("hawlai_site");
    expect(created[0].actionKey).toBe("update_page_text");
    expect(r.approval_id).toBe("ap1");
    // No write at propose time.
    expect(writes.filter((w) => w.table === "website_pages")).toEqual([]);
  });

  it("refuses an id that isn't on the page, and says what is", async () => {
    const r: any = await tool("edit_page_text", { page: "home", edits: [{ blockId: "made-up", prop: "text", text: "New" }] });
    expect(r.success).toBeUndefined();
    expect(r.error).toMatch(/don't have those lines/);
    expect((r.lines ?? []).map((l: any) => l.blockId)).toEqual(["h1", "t1", "b1"]);
  });

  it("says the edit goes live immediately on a published site", async () => {
    const r: any = await tool("edit_page_text", { page: "home", edits: [{ blockId: "h1", prop: "text", text: "Candles poured by hand" }] });
    expect(r.warnings.join(" ")).toMatch(/LIVE page straight away/);
  });

  it("says nothing is public when the site isn't published", async () => {
    site.published = false;
    const r: any = await tool("edit_page_text", { page: "home", edits: [{ blockId: "h1", prop: "text", text: "Candles poured by hand" }] });
    expect(r.warnings.join(" ")).toMatch(/isn't published/);
    expect(r.warnings.join(" ")).not.toMatch(/LIVE page straight away/);
  });

  it("works on a page other than the homepage", async () => {
    const r: any = await tool("edit_page_text", { page: "about", edits: [{ blockId: "h2", prop: "text", text: "How we started" }] });
    expect(r.success).toBe(true);
    expect(r.page).toBe("about");
  });
});

// ---- provenance: THE decision ----------------------------------------

describe("approving a Hawlai draft does not make it the owner's word", () => {
  it("keeps a draft as generated", async () => {
    await tool("edit_page_text", { page: "home", edits: [{ blockId: "h1", prop: "text", text: "Candles poured by hand" }] });
    expect(created[0].requestedChanges.edits[0].source).toBe("generated");
  });

  it("marks text the owner dictated as edited", async () => {
    await tool("edit_page_text", { page: "home", edits: [{ blockId: "h1", prop: "text", text: "Qaaf ki khushboo", writtenByOwner: true }] });
    expect(created[0].requestedChanges.edits[0].source).toBe("edited");
  });

  it("content_source follows authorship, not just a word change", async () => {
    const { applyEdits, contentSourceAfter } = await import("@/lib/pages/editPage");
    // THE LIVE BUG: the page endpoint flipped content_source whenever the
    // words changed, with no check on who wrote them — so every
    // chat-approved Hawlai draft recorded the owner as standing behind
    // copy they had only pressed Approve on, and a line Hawlai wrote
    // became the evidence that the same line was true.
    const draft = applyEdits(hero(), [{ blockId: "h1", prop: "text", text: "Candles poured by hand" }], facts());
    expect(draft.applied.length).toBe(1);
    expect(contentSourceAfter(draft.applied)).toBeNull();

    const dictated = applyEdits(hero(), [{ blockId: "h1", prop: "text", text: "Qaaf ki khushboo", writtenByOwner: true }], facts());
    expect(contentSourceAfter(dictated.applied)).toBe("edited");
  });

  it("a restore changes nobody's authorship", async () => {
    const { applyEdits, contentSourceAfter } = await import("@/lib/pages/editPage");
    const back = applyEdits(hero(), [{ blockId: "h1", prop: "text", text: "An older headline", restore: true }], facts());
    expect(back.applied[0].restored).toBe(true);
    expect(contentSourceAfter(back.applied)).toBeNull();
    // And the block keeps the mark it had.
    const block = (back.sections as any)[0].children[0];
    expect(block.props._source).toBe("generated");
  });
});

// ---- the guard, in the editor ----------------------------------------

describe("the claims guard and the contact scrub run here too", () => {
  it("strips an unsupported claim from wording Hawlai wrote", async () => {
    const r: any = await tool("edit_page_text", {
      page: "home",
      edits: [{ blockId: "t1", prop: "html", text: "Poured by hand in Shahjahanpur. India's number 1 candle brand." }],
    });
    expect(r.success).toBe(true);
    const sent = created[0].requestedChanges.edits[0].after;
    expect(sent).toContain("Poured by hand in Shahjahanpur.");
    expect(sent).not.toMatch(/number 1/i);
    expect(created[0].requestedChanges.claimWarnings.join(" ")).toMatch(/Business Story doesn't support it/);
  });

  it("keeps the owner's own wording and warns instead", async () => {
    const OWN = "Poured by hand. India's number 1 candle brand.";
    const r: any = await tool("edit_page_text", { page: "home", edits: [{ blockId: "t1", prop: "html", text: OWN, writtenByOwner: true }] });
    expect(r.success).toBe(true);
    // Rule C: theirs, character for character.
    expect(created[0].requestedChanges.edits[0].after).toBe(OWN);
    expect(created[0].requestedChanges.claimWarnings.join(" ")).toMatch(/you're the one standing behind that claim/);
  });

  it("will not put an invented email on the page, even if the owner typed it", async () => {
    const r: any = await tool("edit_page_text", {
      page: "home",
      edits: [{ blockId: "t1", prop: "html", text: "Order by hand. Email hello@candlebyqaaf.com to enquire.", writtenByOwner: true }],
    });
    expect(created[0].requestedChanges.edits[0].after).not.toContain("hello@candlebyqaaf.com");
    // An invented address is not a claim to argue with — it is an
    // address that swallows enquiries — so it is pointed out, not
    // published, whoever wrote it.
    expect(created[0].requestedChanges.claimWarnings.join(" ")).toMatch(/no record of/);
    expect(r.success).toBe(true);
  });

  it("refuses rather than emptying a line when it was all claim", async () => {
    const r: any = await tool("edit_page_text", { page: "home", edits: [{ blockId: "h1", prop: "text", text: "India's number 1 candle brand" }] });
    expect(r.success).toBeUndefined();
    expect(r.error).toMatch(/nothing left on the page/);
    expect(r.saved).toBe(false);
  });
});

// ---- the page kinds ---------------------------------------------------

describe("pages whose words are not the page's to change", () => {
  it("CHANGES the ordinary heading on a shop page", async () => {
    // Amended 2026-10-03. Refusing the whole page taught the owner that
    // chat could not touch their shop page at all — and then the chat
    // asked them for wording it would have refused next, which was
    // worse than the refusal.
    const r: any = await tool("edit_page_text", { page: "products", edits: [{ blockId: "h4", prop: "text", text: "Everything we pour" }] });
    expect(r.success).toBe(true);
    expect(r.changed).toEqual([{ what: "heading", from: "The Shop", to: "Everything we pour" }]);
  });

  it("refuses the catalogue block, and the card inside it", async () => {
    for (const blockId of ["g4", "pc1"]) {
      const r: any = await tool("edit_page_text", { page: "products", edits: [{ blockId, prop: blockId === "g4" ? "heading" : "text", text: "Our range" }] });
      expect(r.error, blockId).toMatch(/shows your catalogue/);
      expect(r.refusedBlocks, blockId).toContain(blockId);
    }
    expect(created).toEqual([]);
  });

  it("tells the chat not to ask for different wording for a refused block", async () => {
    const r: any = await tool("edit_page_text", { page: "products", edits: [{ blockId: "g4", prop: "heading", text: "Our range" }] });
    expect(r.note).toMatch(/Do NOT ask them for different wording/);
    // And offers what IS editable, so the chat has something true to say.
    expect((r.editableLines ?? []).map((l: any) => l.blockId)).toEqual(["h4", "t4"]);
  });

  it("refuses a price in prose, wherever the block is", async () => {
    // The block being ordinary text is not enough: a paragraph saying
    // "from ₹550" sits next to ₹999 in the catalogue and nobody knows
    // which is right.
    for (const text of ["Candles from ₹550.", "Candles from Rs 550.", "Candles from 550 rupees.", "Candles from INR 550."]) {
      const r: any = await tool("edit_page_text", { page: "products", edits: [{ blockId: "t4", prop: "html", text }] });
      expect(r.error, text).toMatch(/puts a price on the page/);
      expect(r.saved, text).toBe(false);
    }
    expect(created).toEqual([]);
  });

  it("refuses a product name that isn't in the catalogue", async () => {
    const r: any = await tool("edit_page_text", { page: "home", edits: [{ blockId: "t1", prop: "html", text: "Try our Midnight Oud Candle today." }] });
    expect(r.error).toMatch(/isn't in your catalogue/);
    expect(r.error).toMatch(/Add it as a product first/);
  });

  it("allows a product name that IS in the catalogue", async () => {
    const r: any = await tool("edit_page_text", { page: "home", edits: [{ blockId: "t1", prop: "html", text: "Our Lavender candle is poured by hand." }] });
    expect(r.success).toBe(true);
  });

  it("edits a legal page, with a warning, and never silently", async () => {
    const r: any = await tool("edit_page_text", {
      page: "privacy-policy",
      edits: [{ blockId: "t3", prop: "html", text: "We keep your order details for 5 years as required by law. We never sell your data.", writtenByOwner: true }],
    });
    expect(r.success).toBe(true);
    expect(created[0].requestedChanges.claimWarnings.join(" ")).toMatch(/This is a legal page/);
  });

  it("warns specifically when a legal line gets much shorter", async () => {
    const { legalWarning } = await import("@/lib/pages/editPage");
    const note = legalWarning([{ blockId: "t3", prop: "html", blockType: "text", before: "We keep your order details for 7 years as required by law. We never sell your data.", after: "We never sell your data.", source: "edited" }]);
    expect(note).toMatch(/noticeably shorter/);
    expect(note).toMatch(/nothing you're obliged to say has gone with it/);
  });
});

// ---- what it must never touch ----------------------------------------

describe("the body writer never writes the search title", () => {
  it("sends no seo_title or meta_description anywhere", async () => {
    await tool("edit_page_text", { page: "home", edits: [{ blockId: "h1", prop: "text", text: "Candles poured by hand" }] });
    const payload = JSON.stringify(created[0].requestedChanges);
    expect(payload).not.toMatch(/seoTitle|seo_title|metaDescription|meta_description/);
  });

  it("and the platform's text path only ever writes sections", () => {
    const platform = readFileSync("src/lib/publish/platforms/hawlaiSite.ts", "utf8");
    const textPath = platform.slice(platform.indexOf("async function executeText"), platform.indexOf("return {\n    id: \"hawlai_site\""));
    expect(textPath).toMatch(/update: Record<string, unknown> = \{ sections: result\.sections/);
    expect(textPath).not.toMatch(/seo_title|meta_description|og_image_url/);
  });

  it("propose_page_meta is still the only writer of those two", () => {
    const platform = readFileSync("src/lib/publish/platforms/hawlaiSite.ts", "utf8");
    expect(platform).toMatch(/const COLUMN: Record<string, string> = \{ seoTitle: "seo_title", metaDescription: "meta_description", ogImageUrl: "og_image_url" \}/);
  });
});

// ---- the retired path -------------------------------------------------

describe("the old homepage-only path is gone, not left beside the new one", () => {
  it("update_landing_page no longer exists", async () => {
    const { TOOLS } = await import("@/lib/agents/masterBrainV2");
    const names = (TOOLS as any[]).map((t) => t.name);
    expect(names).not.toContain("update_landing_page");
    expect(names).toContain("read_page");
    expect(names).toContain("edit_page_text");
    expect(names).toContain("undo_page_edit");
  });

  it("and its PublishStrip action with it, so there is one publish path", () => {
    const actionsFile = readFileSync("src/lib/chat/publishActions.ts", "utf8");
    expect(actionsFile).not.toMatch(/homepageCopyAction/);
  });

  it("the new tool tells the model to read before it writes", async () => {
    const { TOOLS } = await import("@/lib/agents/masterBrainV2");
    const edit: any = (TOOLS as any[]).find((t) => t.name === "edit_page_text");
    expect(edit.description).toMatch(/CALL read_page FIRST/);
    expect(edit.description).toMatch(/does NOT touch the search title or meta description/);
    // And that it cannot do the things it cannot do.
    expect(edit.description).toMatch(/cannot add, remove or reorder sections/);
    expect(edit.input_schema.properties.edits.items.properties.writtenByOwner.description).toMatch(/approving a draft is approving its publication, not vouching for it/);
  });
});

// ---- undo -------------------------------------------------------------

describe("undo replays what the line said before", () => {
  beforeEach(() => {
    // An executed edit, with the previous wording on its preview — which
    // is why undo needs no new table and cannot drift from what was
    // really on the page.
    actions = [
      {
        id: "act1",
        target_ref: "p1",
        target_label: "Home (/site/candle-by-qaaf)",
        executed_at: "2026-10-03T10:00:00Z",
        preview: { changes: [{ field: "t1:html", before: "Small-batch soy candles, poured by hand.", after: "Hand-poured soy candles, made in Shahjahanpur." }] },
      },
    ];
    pages[0].sections = [
      {
        id: "s1", type: "section", props: { background: "dark" },
        children: [
          { id: "h1", type: "heading", props: { text: "Candles by Qaaf", _source: "generated" }, children: [] },
          { id: "t1", type: "text", props: { html: "Hand-poured soy candles, made in Shahjahanpur.", _source: "generated" }, children: [] },
          { id: "b1", type: "button", props: { label: "Shop now", _source: "generated" }, children: [] },
        ],
      },
    ];
  });

  it("proposes the exact previous wording, word for word", async () => {
    const r: any = await tool("undo_page_edit", {});
    expect(r.success).toBe(true);
    expect(r.changed).toEqual([{ what: "text", from: "Hand-poured soy candles, made in Shahjahanpur.", to: "Small-batch soy candles, poured by hand." }]);
    // Not regenerated, and said so on the card.
    expect(created[0].requestedChanges.claimWarnings.join(" ")).toMatch(/puts back exactly what the line said before/);
  });

  it("goes through the same approval card, changing nothing yet", async () => {
    const r: any = await tool("undo_page_edit", {});
    expect(created[0].actionKey).toBe("update_page_text");
    expect(r.approval_id).toBe("ap1");
    expect(writes.filter((w) => w.table === "website_pages")).toEqual([]);
  });

  it("restores without re-guarding, so an undo really undoes", async () => {
    // The restored text was already published: running the guard again
    // would mean an undo that silently fails to restore the line.
    expect(created).toEqual([]);
    actions[0].preview.changes[0].before = "India's number 1 candle brand.";
    const r: any = await tool("undo_page_edit", {});
    expect(r.success).toBe(true);
    expect(created[0].requestedChanges.edits[0].after).toBe("India's number 1 candle brand.");
  });

  it("says plainly when there is nothing of ours to undo", async () => {
    actions = [];
    const r: any = await tool("undo_page_edit", {});
    expect(r.error).toMatch(/haven't changed any wording on your site from chat/);
    // And does not pretend Website Builder's history is here.
    expect(r.error).toMatch(/Website Builder isn't recorded here/);
    expect(r.saved).toBe(false);
  });

  it("says so when the named page has no chat edit on record", async () => {
    const r: any = await tool("undo_page_edit", { page: "about" });
    expect(r.error).toMatch(/no record of changing the words on "about"/);
  });

  it("does nothing when the page already says what it said before", async () => {
    pages[0].sections[0].children[1].props.html = "Small-batch soy candles, poured by hand.";
    const r: any = await tool("undo_page_edit", {});
    expect(r.error).toMatch(/already says what it said before/);
    expect(created).toEqual([]);
  });
});

// ---- what the chat is allowed to say ---------------------------------

describe("after a refusal the chat explains, and does not ask for a retry", () => {
  it("is told to relay the reason and never invite wording that would be refused", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/WHEN A TOOL REFUSES, EXPLAIN THE REFUSAL AND DO NOT ASK FOR ANOTHER GO AT IT/);
    // The exact sentence it produced on 3 Oct, so the rule is testable.
    expect(brain).toMatch(/Koi specific wording batao/);
    expect(brain).toMatch(/any wording would be refused for the same reason/);
  });

  it("is told not to promise 'as-is' before a tool has accepted it", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/NEVER promise that wording will be kept "as-is"/);
    expect(brain).toMatch(/Until the card exists, you do not know that it will be kept/);
  });

  it("the refused result carries the reason and the alternative, so there is no need to guess", async () => {
    const r: any = await tool("edit_page_text", { page: "products", edits: [{ blockId: "pc1", prop: "text", text: "Our range" }] });
    // Three things the chat needs in order to answer honestly: why, what
    // it cannot do, and what it can.
    expect(r.error).toMatch(/shows your catalogue/);
    expect(r.error).toMatch(/ordinary headings and paragraphs on that page I can change/);
    expect(r.note).toMatch(/Do NOT ask them for different wording/);
    expect(Array.isArray(r.editableLines)).toBe(true);
  });
});

describe("the card shows both wordings, in full", () => {
  it("sends them as a change, not as a truncated field", async () => {
    const { extractArtifact } = await import("@/lib/agents/masterBrainV2");
    const result = await tool("edit_page_text", {
      page: "home",
      edits: [{ blockId: "t1", prop: "html", text: "Hand-poured soy candles, made in Shahjahanpur, from wax we choose ourselves and fragrances picked because they actually last the evening." }],
    });
    const artifact: any = extractArtifact("edit_page_text", {}, result);
    expect(artifact.changes).toEqual([
      {
        label: "Paragraph",
        before: "Small-batch soy candles, poured by hand.",
        after: "Hand-poured soy candles, made in Shahjahanpur, from wax we choose ourselves and fragrances picked because they actually last the evening.",
      },
    ]);
    // THE BUG: a `fields` row renders on one truncated line, so the
    // owner saw the old wording cut off and the new wording only in the
    // chat message beside the card — approving what the chat said rather
    // than what the card said.
    expect(artifact.fields).toBeUndefined();
  });

  it("the card renders both, and collapses rather than truncating", () => {
    const chat = readFileSync("src/components/chat/MasterChatPage.tsx", "utf8");
    expect(chat).toMatch(/function CopyChange/);
    expect(chat).toMatch(/artifact\.changes\.map/);
    // Full text, wrapped — never `truncate`, which cannot be opened.
    expect(chat).toMatch(/Show the full wording/);
    expect(chat).toMatch(/\{before\.trim\(\) \? before : "\(empty\)"\}/);
    expect(chat).toMatch(/\{after\}/);
  });
});
