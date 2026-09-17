// The chat's add-item tool and the DM auto-reply catalogue know about
// services (migration 188).
//
// THE LIVE CASE (2026-09-18): asked in chat to "add a new service item —
// Candle Making Workshop, ₹800, 90 minute duration", the AI Employee said
// candle_by_qaaf is a "product-based store" and offered to add it as a
// regular product. Its add_product tool still only knew products: no kind,
// no duration, no booking link — the Products tab had them, chat didn't.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert") {
        const row = { id: `${table}-new`, ...payload };
        (tables[table] ??= []).push(row);
        return { data: row, error: null };
      }
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api,
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      order: () => api,
      limit: () => api,
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { executeTool, extractArtifact, TOOLS } from "@/lib/agents/masterBrainV2";
import { autoReplyCatalog } from "@/lib/webhooks/autoReplyHandler";
import { generateAutoReply } from "@/lib/agents/socialManagementAgent";

const ctx: any = { id: "biz-1", name: "candle_by_qaaf", category: "Home fragrance" };

beforeEach(() => {
  tables = { products: [], dealerships: [{ id: "biz-1", booking_slug: null, business_models: ["products"] }] };
});

describe("chat can add a service", () => {
  it("the tool offered to the AI has the product/service choice and the service fields", () => {
    const tool = TOOLS.find((t: any) => t.name === "add_product") as any;
    expect(tool.input_schema.properties.kind).toEqual(expect.objectContaining({ enum: ["product", "service"] }));
    expect(tool.input_schema.properties).toHaveProperty("durationMinutes");
    expect(tool.input_schema.properties).toHaveProperty("bookingUrl");
    expect(tool.description).toMatch(/Never refuse a service/);
  });

  it("the live case: a 90-minute ₹800 workshop is saved as a service, with no stock", async () => {
    const result = await executeTool(db(), ctx, "add_product", { kind: "service", name: "Candle Making Workshop", price: 800, durationMinutes: 90, inventoryCount: 10 }, "");
    expect(result).toMatchObject({ success: true, kind: "service" });
    expect(tables.products[0]).toMatchObject({ dealership_id: "biz-1", name: "Candle Making Workshop", price: 800, kind: "service", duration_minutes: 90, inventory_count: null });
    // Honest about where Book goes, and about the business model saying products only.
    expect(result.note).toContain("(1 hr 30 min)");
    expect(result.note).toContain("Contact us to book");
    expect(result.note).toContain("tick Services");
    expect(extractArtifact("add_product", {}, result)).toMatchObject({ label: "Service added" });
  });

  it("with a booking page, says customers go there; a services business isn't told to tick Services", async () => {
    tables.dealerships = [{ id: "biz-1", booking_slug: "qaaf", business_models: ["products", "services"] }];
    const result = await executeTool(db(), ctx, "add_product", { kind: "service", name: "Workshop", price: 800 }, "");
    expect(result.note).toContain("business's booking page");
    expect(result.note).not.toContain("tick Services");
  });

  it("an invalid booking link is refused, and nothing is saved", async () => {
    const result = await executeTool(db(), ctx, "add_product", { kind: "service", name: "Workshop", price: 800, bookingUrl: "javascript:alert(1)" }, "");
    expect(result.error).toMatch(/booking link/);
    expect(tables.products).toHaveLength(0);
  });

  it("a product is still a product, with its stock", async () => {
    const result = await executeTool(db(), ctx, "add_product", { name: "Mogra Nights candle", price: 599, inventoryCount: 12 }, "");
    expect(tables.products[0]).toMatchObject({ kind: "product", inventory_count: 12 });
    expect(extractArtifact("add_product", {}, result)).toMatchObject({ label: "Product added" });
  });
});

describe("DM and comment auto-replies know a service is booked", () => {
  const items: any[] = [
    { id: "p1", name: "Lavender candle", kind: "product", price: 550, description: null, images: [], inventory: 3, category: null, active: true },
    { id: "s1", name: "Candle Making Workshop", kind: "service", durationMinutes: 90, bookingUrl: null, price: 800, description: null, images: [], inventory: 5, category: null, active: true },
  ];

  it("services carry duration and where to book, never stock", () => {
    const catalog = autoReplyCatalog(items, "https://hawlai.online/book/qaaf");
    expect(catalog[0]).toEqual({ name: "Lavender candle", price: 550, description: null, inventoryCount: 3 });
    expect(catalog[1]).toMatchObject({ kind: "service", durationMinutes: 90, bookingLink: "https://hawlai.online/book/qaaf", inventoryCount: null });
  });

  it("the reply prompt calls it a service with its booking link, not 'in stock'", async () => {
    let prompt = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: any, init: any) => {
      prompt = JSON.parse(init.body).messages[0].content;
      return new Response(JSON.stringify({ content: [{ text: '{"reply":"hi"}' }], usage: {} }), { status: 200 });
    }));
    try {
      await generateAutoReply("dm", "is the workshop available?", "candle_by_qaaf", "Home fragrance", null, autoReplyCatalog(items, "https://hawlai.online/book/qaaf"));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(prompt).toContain("- Candle Making Workshop: ₹800 (a SERVICE — booked, not bought or shipped, 1 hr 30 min; book at https://hawlai.online/book/qaaf)");
    expect(prompt).toContain("- Lavender candle: ₹550 (in stock)");
  });
});
