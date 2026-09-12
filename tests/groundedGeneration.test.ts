// Generated pictures and copy are tied to what the business really sells.
//
// THE BUG: a "Diwali post" for candle_by_qaaf came back as diyas and
// rangoli with no candle anywhere. Every image path was given the
// business NAME and a CATEGORY WORD and nothing else — no product names,
// no descriptions, no photo — so the occasion in the brief decided the
// picture. The text paths outside Content/Social/Email/WhatsApp had the
// same hole: a brand tone string and a category, no catalogue.
//
// Now one canonical source (businessFacts.ts) feeds both: copy prompts
// carry the VERIFIED FACTS, and image briefs carry a hero-subject line
// plus the product's own photo as a reference.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserted: { table: string; values: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, ilike: () => api,
      update: (v: Row) => ((op = "update"), (values = v), api),
      insert: (v: Row) => ((op = "insert"), (values = v), inserted.push({ table, values: v }), api),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : (tables[table] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? tables[table] ?? [] : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

const CANDLE = (): Record<string, Row[]> => ({
  profiles: [{ id: "u1", dealership_id: "d1" }],
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: ["https://cdn.example/lavender.jpg"], inventory_count: 5, is_active: true, order_index: 0 }],
  discount_codes: [],
  orders: [],
  leads: [],
  page_events: [],
  abandoned_carts: [],
  business_knowledge: [],
  brand_profiles: [{ tone_of_voice: "warm", messaging_pillars: [] }],
  brand_kits: [{ kit: { colors: [{ name: "Clay", hex: "#B06A4F", role: "primary" }] }, logo_url: null }],
  team_members: [],
  business_memory: [],
  video_generations: [],
  graphic_designs: [],
});

/** Gemini (image), the product CDN and Anthropic, all answered; every request recorded. */
function network() {
  const calls: { url: string; body: any }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any = {}): Promise<any> => {
      const u = String(url);
      calls.push({ url: u, body: init.body ? JSON.parse(init.body) : null });
      if (u.includes("cdn.example")) {
        return { ok: true, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new TextEncoder().encode("real-photo").buffer };
      }
      if (u.includes("generativelanguage")) {
        const payload = { candidates: [{ content: { parts: [{ inline_data: { data: Buffer.from("png").toString("base64") } }] } }] };
        return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
      }
      const reply = { content: [{ type: "text", text: JSON.stringify({ title: "Lavender candle", description: "Slow evenings, hand-poured.", highlights: ["Soy wax"] }) }] };
      return { ok: true, status: 200, json: async () => reply, text: async () => JSON.stringify(reply), headers: { get: () => null } };
    })
  );
  return calls;
}

const geminiCall = (calls: { url: string; body: any }[]) => calls.find((c) => c.url.includes("generativelanguage"))!;
const anthropicCall = (calls: { url: string; body: any }[]) => calls.find((c) => c.url.includes("anthropic"))!;

const videoStart = vi.fn(async (..._args: any[]) => "task-1");
vi.mock("@/lib/videoModels", () => ({
  getVideoAdapter: () => ({ start: videoStart }),
  isModelConfigured: () => true,
  getFallbackModelKey: () => null,
  listVideoModels: () => [],
}));
vi.mock("@/lib/featureFlags", async (orig) => ({ ...(await orig<any>()), isFeatureEnabled: () => true }));
vi.mock("@/lib/usage/generationLimits", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/generationLimits")>()),
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
}));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: (t: string) => db().from(t) }) }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => db().from(t),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example/out.png" } }) }) },
  }),
}));
vi.mock("@/lib/plans", async (orig) => ({
  ...(await orig<typeof import("@/lib/plans")>()),
  getDealershipPlanLimits: async () => ({}),
  hasFeature: () => true,
  killSwitchFor: () => null,
}));

import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { generateGraphic } from "@/lib/agents/graphicDesignAgent";
import { generateAdImageFromDescription } from "@/lib/adEngine";
import { POST as generateVideo } from "@/app/api/creative/video/generate/route";
import { POST as productDescription } from "@/app/api/creative/product-description/route";
import { executeTool } from "@/lib/agents/masterBrainV2";

const post = (path: string, body: unknown) =>
  new Request(`https://app.hawlai.com${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  tables = CANDLE();
  inserted = [];
  videoStart.mockClear();
  process.env.GEMINI_API_KEY = "test-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("graphics are anchored to the real product", () => {
  it("a Diwali brief gets the candle as hero subject, and the product's own photo as reference", async () => {
    const calls = network();
    const facts = await gatherBusinessFacts(db(), "d1");
    await generateGraphic("social_graphic", "candle_by_qaaf", "Home fragrance", "Diwali sale post with diyas and rangoli", { tone_of_voice: "warm" }, undefined, null, null, facts);

    const parts = geminiCall(calls).body.contents[0].parts;
    expect(parts[0].inline_data.mime_type).toBe("image/jpeg");
    expect(Buffer.from(parts[0].inline_data.data, "base64").toString()).toBe("real-photo");
    expect(parts[1].text).toContain("Lavender candle");
    expect(parts[1].text).toContain("Do not substitute a different product");
    expect(parts[1].text).toMatch(/ACTUAL product/);
    // Brand colours come from the same canonical read.
    expect(parts[1].text).toContain("#B06A4F");
  });

  it("a brief that already names the product is not padded with an anchor", async () => {
    const calls = network();
    const facts = await gatherBusinessFacts(db(), "d1");
    await generateGraphic("social_graphic", "candle_by_qaaf", "Home fragrance", "Lavender candle beside a book", null, undefined, null, null, facts);
    expect(geminiCall(calls).body.contents[0].parts[1].text).not.toContain("The hero subject is");
  });

  it("without facts it behaves exactly as before — text only, no reference photo", async () => {
    const calls = network();
    await generateGraphic("social_graphic", "candle_by_qaaf", "Home fragrance", "Diwali sale post", null);
    const parts = geminiCall(calls).body.contents[0].parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).not.toContain("hero subject");
  });
});

describe("ad creatives built from words alone", () => {
  it("the invented scene is anchored to the catalogue and shown the real photo", async () => {
    const calls = network();
    const facts = await gatherBusinessFacts(db(), "d1");
    await generateAdImageFromDescription({ image_scene_prompt: "festive diyas on a marble table" }, "Home fragrance", facts);

    const parts = geminiCall(calls).body.contents[0].parts;
    expect(parts[0].inline_data).toBeTruthy();
    expect(parts[1].text).toContain("festive diyas on a marble table");
    expect(parts[1].text).toContain("Lavender candle");
  });
});

describe("video generation", () => {
  it("the model is asked for the real product, and the stored prompt matches what was sent", async () => {
    network();
    const res = await generateVideo(post("/api/creative/video/generate", { prompt: "Diwali sale reel", model: "veo" }));
    expect(res.status).toBe(200);

    const sent = videoStart.mock.calls[0][0] as unknown as string;
    expect(sent).toContain("Diwali sale reel");
    expect(sent).toContain("Lavender candle");
    expect(inserted.find((i) => i.table === "video_generations")!.values.prompt).toBe(sent);
  });
});

describe("the text departments that had no facts at all", () => {
  it("a product description is written from the catalogue, prices and shipping", async () => {
    const calls = network();
    const res = await productDescription(post("/api/creative/product-description", { carModel: "Lavender candle", details: "40 hour burn" }));
    expect(res.status).toBe(200);

    const prompt = anthropicCall(calls).body.messages[0].content;
    expect(prompt).toContain("VERIFIED FACTS");
    expect(prompt).toContain("Lavender candle — ₹550");
    expect(prompt).toContain("₹60 flat on every order (NOT free)");
    expect(prompt).toMatch(/NEVER invent numbers/);
  });
});

describe("the chat's product ad reads the shared catalogue", () => {
  const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [], facts: null };

  it("an out-of-stock product is refused with the reason, using the canonical fields", async () => {
    network();
    tables.products = [{ id: "p1", name: "Lavender candle", price: 550, images: ["https://cdn.example/lavender.jpg"], inventory_count: 0, is_active: true, order_index: 0 }];
    const result = await executeTool(db(), CTX, "create_product_ad", { productName: "lavender", instruction: "Diwali ad" }, "");
    expect(result.error).toMatch(/out of stock/);
  });

  it("an unpublished product is refused as unpublished, not as missing", async () => {
    network();
    tables.products = [{ id: "p1", name: "Lavender candle", price: 550, images: ["https://cdn.example/lavender.jpg"], inventory_count: 5, is_active: false, order_index: 0 }];
    const result = await executeTool(db(), CTX, "create_product_ad", { productName: "lavender", instruction: "Diwali ad" }, "");
    expect(result.error).toMatch(/unpublished/);
  });
});
