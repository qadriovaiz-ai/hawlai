// CARD 8C68 — the founder's test, 28 November 2026.
//
// "DD23 approve ho chuka hai, ab Lavender candle ka stock 20 karo." The
// chat, still remembering the price as unfinished, sent price ₹499 AND
// stock 20 together. The tool refused with "one change at a time" and
// named neither, so the chat dropped the STOCK and re-sent the price. The
// product was already ₹499, and a ₹499 → ₹499 card was made anyway. On
// WhatsApp it read only "Price change requested" — no product, no
// numbers — and the chat then asked the owner whether the price was ₹499
// or ₹999.
//
// Three fixes, one per section:
//   1. a field already at the asked value is dropped before counting,
//      and two real changes are refused BY NAME;
//   2. no card is made when nothing would change;
//   3. the WhatsApp line says what the card does.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code } from "./helpers/source";
import { productAlreadyHas } from "@/lib/catalog/alreadyHas";
import { createPublishAction, type CreateInput } from "@/lib/publish/create";
import { createHawlaiShopPlatform } from "@/lib/publish/platforms/hawlaiShop";
import { cardsForWhatsApp } from "@/lib/whatsapp/approvalReply";
import { extractArtifact } from "@/lib/agents/masterBrainV2";
import type { CatalogProduct } from "@/lib/claims/businessFacts";
import type { PublishPlatform } from "@/lib/publish/types";

const MUG = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: "p1",
  name: "Clay mug",
  price: 499,
  description: "Hand-thrown.",
  images: [],
  inventory: 5,
  category: "Kitchen",
  active: true,
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("1. A FIELD THE PRODUCT ALREADY HAS IS NOT A CHANGE", () => {
  it("THE 8C68 CASE: price 499 on a ₹499 product is already there; stock 20 on stock 5 is not", () => {
    expect(productAlreadyHas(MUG(), "price", "499")).toBe(true);
    expect(productAlreadyHas(MUG(), "price", "₹499.00")).toBe(true);
    expect(productAlreadyHas(MUG(), "stock", "20")).toBe(false);
  });

  it("a different price is a change", () => {
    expect(productAlreadyHas(MUG(), "price", "999")).toBe(false);
  });

  it("stock: the same number is no change; clearing is no change only when untracked already", () => {
    expect(productAlreadyHas(MUG(), "stock", "5")).toBe(true);
    expect(productAlreadyHas(MUG(), "stock", "")).toBe(false);
    expect(productAlreadyHas(MUG({ inventory: null }), "stock", "")).toBe(true);
    expect(productAlreadyHas(MUG({ inventory: 0 }), "stock", "0")).toBe(true);
  });

  it("show/hide, category, name and description compare against what is stored", () => {
    expect(productAlreadyHas(MUG(), "visibility", "show")).toBe(true);
    expect(productAlreadyHas(MUG(), "visibility", "hide")).toBe(false);
    expect(productAlreadyHas(MUG({ active: false }), "visibility", "hide")).toBe(true);
    expect(productAlreadyHas(MUG(), "category", "Kitchen")).toBe(true);
    expect(productAlreadyHas(MUG({ category: null }), "category", "")).toBe(true);
    expect(productAlreadyHas(MUG(), "name", "Clay mug")).toBe(true);
    expect(productAlreadyHas(MUG(), "name", "Clay Mug")).toBe(false);
    expect(productAlreadyHas(MUG(), "description", "Hand-thrown.")).toBe(true);
  });

  it("WHAT CAN'T BE READ IS KEPT AS A CHANGE — the \"was\" price is not in the catalog, an unreadable price is not dropped", () => {
    expect(productAlreadyHas(MUG(), "compare_price", "999")).toBe(false);
    expect(productAlreadyHas(MUG(), "price", "lots")).toBe(false);
    expect(productAlreadyHas(MUG(), "stock", "twenty")).toBe(false);
  });
});

describe("1b. THE TOOL DROPS IT BEFORE COUNTING, AND NAMES TWO REAL CHANGES — read with comments stripped", () => {
  const src = code("src/lib/agents/masterBrainV2.ts");
  const start = src.indexOf('case "propose_price_change": {');
  const end = src.indexOf('case "', start + 40);
  const tool = src.slice(start, end);
  const own = tool.slice(tool.indexOf("if (ownMatches.length === 1 || chosenOwn) {"), tool.indexOf("const requestedChanges ="));

  it("THE TOOL AND ITS OWN-STORE BLOCK ARE FOUND", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(own.length).toBeGreaterThan(200);
  });

  it("ON THE OWNER'S STORE: fields already there are dropped, then more than one left is refused by name", () => {
    expect(own).toMatch(/if \(askedFields\.length > 1\) \{[\s\S]*const remaining = askedFields\.filter\(\(\[f, v\]\) => !productAlreadyHas\(product, f, clearedFrom\(f, String\(v \?\? ""\)\.trim\(\)\)\)\);/);
    expect(own).toMatch(/if \(remaining\.length === 0\) \{\s*return \{ nothing_to_change: true,/);
    expect(own).toMatch(/if \(remaining\.length > 1\) return oneAtATime\(remaining\);\s*field = remaining\[0\]\[0\];\s*fieldValue = String\(remaining\[0\]\[1\] \?\? ""\)\.trim\(\);\s*cleared = clearedFrom\(field, fieldValue\);/);
  });

  it("ON A CONNECTED SHOPIFY STORE, two fields are still refused by name", () => {
    const shopify = tool.slice(tool.indexOf("const creds = await resolveShopifyCredentials"));
    expect(shopify).toMatch(/if \(askedFields\.length > 1\) return oneAtATime\(askedFields\);/);
  });

  it("THE REFUSAL NAMES THE FIELDS — 'one at a time' alone is what lost the stock", () => {
    expect(tool).toMatch(/That asks for \$\{words\.slice\(0, -1\)\.join\(", "\)\} and \$\{words\[words\.length - 1\]\} together/);
    expect(tool).not.toMatch(/"One change at a time, so each gets its own approval/);
  });

  it("A NO-OP FROM THE PIPELINE REACHES THE CHAT AS 'nothing to change', not as an error to apologise for", () => {
    expect(tool).toMatch(/if \(!ownCreated\.ok\) return ownCreated\.nothingToChange \? \{ nothing_to_change: true, note: ownCreated\.reason \} : \{ error: ownCreated\.reason \};/);
    expect(tool).toMatch(/if \(!created\.ok\) return created\.nothingToChange \? \{ nothing_to_change: true, note: created\.reason \} : \{ error: created\.reason \};/);
  });
});

// ── 2. the pipeline ─────────────────────────────────────────────────

function fakeDb() {
  const writes: { table: string; op: string; fields: Record<string, any> }[] = [];
  const from = (table: string) => {
    let op: string | null = null;
    let fields: Record<string, any> = {};
    const api: any = {
      select: () => api, eq: () => api, like: () => api, in: () => api, is: () => api, gte: () => api, not: () => api, order: () => api,
      insert: (f: Record<string, any>) => ((op = "insert"), (fields = f), writes.push({ table, op, fields: f }), api),
      update: (f: Record<string, any>) => ((op = "update"), (fields = f), writes.push({ table, op, fields: f }), api),
      then: (res: any) => res({ data: op === null ? [] : null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: op === "insert" ? { id: table === "publish_actions" ? "act-1" : "app-1", ...fields } : null, error: null }),
    };
    return api;
  };
  return { client: { from }, writes };
}

const input = (over: Partial<CreateInput> = {}): CreateInput => ({
  dealershipId: "d1",
  platform: "hawlai_shop",
  actionKey: "update_product_price",
  targetRef: "p1",
  targetLabel: "Clay mug",
  requestedChanges: { price: "499" },
  requestedBy: null,
  ...over,
});

const previewing = (nothingToChange: boolean): PublishPlatform => ({
  id: "hawlai_shop",
  supports: ["update_product_price"],
  isConnected: async () => true,
  preview: async () => ({
    ok: true,
    preview: {
      summary: '"Clay mug" — Price: ₹499.00 → ₹499.00',
      target: { title: "Clay mug", variantTitle: null, currentPrice: "₹499.00", imageUrl: null },
      changes: [{ field: "price", before: "499", after: "499" }],
      warnings: [],
      nothingToChange,
    },
  }),
  execute: async () => ({ ok: true, platformResponse: {} }),
});

describe("2. NO CARD WHEN NOTHING WOULD CHANGE", () => {
  it("THE 8C68 CARD IS NOT MADE: no approval row, and the attempt is kept, marked failed, with why", async () => {
    const db = fakeDb();
    const r = await createPublishAction(db.client, previewing(true), input());
    expect(r).toEqual({ ok: false, nothingToChange: true, reason: 'Nothing to change — "Clay mug" already has that value, so no approval card was made.' });
    expect(db.writes.filter((w) => w.table === "pending_approvals")).toEqual([]);
    expect(db.writes.at(-1)).toMatchObject({ table: "publish_actions", op: "update", fields: { status: "failed" } });
  });

  it("a real change still gets its card — the refusal is only for a no-op", async () => {
    const db = fakeDb();
    const r = await createPublishAction(db.client, previewing(false), input());
    expect(r.ok).toBe(true);
    expect(db.writes.some((w) => w.table === "pending_approvals" && w.op === "insert")).toBe(true);
  });

  it("THE STORE SAYS WHEN IT IS A NO-OP — the same price, and only then", async () => {
    const tables: Record<string, any[]> = { products: [{ id: "p1", dealership_id: "d1", name: "Clay mug", price: 499, description: "", images: [], is_active: true, inventory_count: 5 }] };
    const db = {
      from: (t: string) => {
        const api: any = { select: () => api, eq: () => api, order: () => api, limit: () => api, maybeSingle: async () => ({ data: tables[t]?.[0] ?? null, error: null }), then: (res: any) => res({ data: tables[t] ?? [], error: null }) };
        return api;
      },
    };
    const shop = createHawlaiShopPlatform({ supabase: db });
    const rec = (requestedChanges: Record<string, unknown>, actionKey = "update_product_price") =>
      ({ id: "a", dealershipId: "d1", platform: "hawlai_shop", connectionRef: null, actionKey, targetRef: "p1", targetLabel: "Clay mug", requestedChanges, preview: null, previewedAt: null, status: "draft", idempotencyKey: "k" }) as any;
    const same = await shop.preview(rec({ price: "499" }));
    const moved = await shop.preview(rec({ price: "999" }));
    const stockSame = await shop.preview(rec({ inventory: "5" }, "update_product_inventory"));
    expect(same.ok && same.preview.nothingToChange).toBe(true);
    expect(moved.ok && moved.preview.nothingToChange).toBe(false);
    expect(stockSame.ok && stockSame.preview.nothingToChange).toBe(true);
  });

  it("SHOPIFY'S PREVIEW SAYS IT TOO — read with comments stripped", () => {
    expect(code("src/lib/publish/platforms/shopify.ts")).toMatch(/nothingToChange: samePrice\(variant\.price, nextPrice\),/);
  });
});

describe("3. THE WHATSAPP LINE SAYS WHAT THE CARD DOES", () => {
  const card = extractArtifact("propose_price_change", {}, {
    success: true,
    approval_id: "8c6886f3-0000-4000-8000-000000000000",
    action_id: "act-1",
    summary: '"Clay mug" — Price: ₹999.00 → ₹499.00',
    note: "Ready for your approval below.",
    product: "Clay mug",
    current_price: "₹999.00",
    new_price: "₹499",
  }) as any;

  it("THE PRICE CARD CARRIES THE PREVIEW'S OWN LINE", () => {
    expect(card.cardLine).toBe('"Clay mug" — Price: ₹999.00 → ₹499.00');
  });

  it("AND WHATSAPP PRINTS IT, not the label 'Price change requested'", () => {
    const text = cardsForWhatsApp([card])!;
    expect(text).toContain('• 8C68: "Clay mug" — Price: ₹999.00 → ₹499.00');
    expect(text).not.toContain("Price change requested");
  });

  it("the line wins over confirm and label; without it the old order holds", () => {
    expect(cardsForWhatsApp([{ approval: { id: "8c6886f3-0000" }, cardLine: "line", confirm: "confirm", label: "label" }])).toContain("• 8C68: line");
    expect(cardsForWhatsApp([{ approval: { id: "8c6886f3-0000" }, confirm: "confirm", label: "label" }])).toContain("• 8C68: confirm");
  });

  it("A NO-OP SHOWS AS 'Nothing to change', with no approval to answer", () => {
    const none = extractArtifact("propose_price_change", {}, { nothing_to_change: true, note: 'Nothing to change — "Clay mug" already has that value, so no approval card was made.' }) as any;
    expect(none).toMatchObject({ label: "Nothing to change" });
    expect(none.approval).toBeUndefined();
    expect(cardsForWhatsApp([none])).toBeNull();
  });
});
