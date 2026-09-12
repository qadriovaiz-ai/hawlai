// One canonical answer to "what does this business sell", for words and
// pictures alike.
//
// THE BUGS BEHIND THIS: fabricated customer counts in CRO, a false "free
// shipping" in a Facebook post, and a Diwali image showing diyas for a
// candle business. All three came from the same root — a dozen code
// paths each fetched "the business" their own way, images got a category
// word and nothing else, and a business with no category saved was
// treated as a CAR DEALERSHIP in 45 places.
//
// These tests pin the canonical source (businessFacts.ts): the catalogue
// every path shares, offer liveness borrowed from checkout, brand
// identity, no invented category — and the image anchor built on it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  gatherBusinessFacts,
  fetchCatalog,
  matchProducts,
  fetchKnowledgeFacts,
  formatFactsForCopy,
  factsPrompt,
  describeBusiness,
  UNKNOWN_CATEGORY,
  type BusinessFacts,
} from "@/lib/claims/businessFacts";
import { buildImageBrief, mentionsProduct, heroProduct, productTerms, imageParts, fetchReferenceImage } from "@/lib/claims/imageBrief";
import { discountUsable, validateDiscountCode } from "@/lib/discounts";
import { getBusinessContext } from "@/lib/businessBrain/getBusinessContext";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let failing: Set<string>;

function db() {
  const from = (table: string) => {
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api,
      maybeSingle: async () => result((tables[table] ?? [])[0] ?? null),
      single: async () => result((tables[table] ?? [])[0] ?? null),
      then: (res: any, rej: any) => Promise.resolve(result(tables[table] ?? [])).then(res, rej),
    };
    const result = (data: any) => (failing.has(table) ? { data: null, error: { message: `${table} is down` } } : { data, error: null });
    return api;
  };
  return { from };
}

const RECENT = new Date().toISOString();
const CANDLE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }],
  website_pages: [{ slug: "home", page_type: "home", title: "Home", sections: [{ type: "hero", headline: "A mood, not just a candle." }] }],
  products: [
    { id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax, 40 hour burn", images: ["https://cdn.example/lavender.jpg", "x"], inventory_count: 12, category: "Candles", is_active: true, order_index: 0 },
    { id: "p2", name: "Mogra Nights candle", price: 650, description: null, images: [], inventory_count: 0, category: "Candles", is_active: true, order_index: 1 },
  ],
  discount_codes: [
    { code: "CALM10", discount_type: "percentage", value: 10, is_active: true, expires_at: null, max_uses: null, used_count: 0, min_order_value: null },
    { code: "OLD20", discount_type: "percentage", value: 20, is_active: true, expires_at: "2020-01-01T00:00:00Z", max_uses: null, used_count: 0, min_order_value: null },
    { code: "USEDUP", discount_type: "fixed", value: 100, is_active: true, expires_at: null, max_uses: 5, used_count: 5, min_order_value: null },
  ],
  orders: [{ status: "delivered", created_at: RECENT }],
  leads: [],
  page_events: [],
  abandoned_carts: [],
  business_knowledge: [{ category: "policy", title: "Packaging", content: "Every candle ships in recycled board" }],
  brand_profiles: [{ tone_of_voice: "warm and unhurried", messaging_pillars: ["Hand-poured in small batches"], target_persona: { age: "25-40" }, preferred_language: "hinglish", brand_voice: { formality_level: "conversational" }, business_description: "Slow-made home fragrance" }],
  brand_kits: [{ kit: { colors: [{ name: "Clay", hex: "#B06A4F", role: "primary" }] }, logo_url: "https://cdn.example/logo.png" }],
  team_members: [],
  business_memory: [],
});

beforeEach(() => {
  tables = CANDLE();
  failing = new Set();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the canonical facts carry everything a generation needs", () => {
  it("products come with photos, stock and category — not just name and price", async () => {
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.products[0]).toEqual({
      id: "p1",
      name: "Lavender candle",
      price: 550,
      description: "Hand-poured soy wax, 40 hour burn",
      images: ["https://cdn.example/lavender.jpg", "x"],
      inventory: 12,
      category: "Candles",
      active: true,
    });
    expect(f.products[1].inventory).toBe(0); // tracked and empty, not "unknown"
  });

  it("brand identity comes from the same read: tone, voice, persona, language, pillars, colours, logo", async () => {
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.brand).toMatchObject({
      tone: "warm and unhurried",
      language: "hinglish",
      pillars: ["Hand-poured in small batches"],
      description: "Slow-made home fragrance",
      colors: [{ name: "Clay", hex: "#B06A4F", role: "primary" }],
      logoUrl: "https://cdn.example/logo.png",
    });
    expect(f.brand.persona).toEqual({ age: "25-40" });
    expect(f.brand.voice).toEqual({ formality_level: "conversational" });
  });

  it("offers use checkout's own liveness rule — expired and used-up codes are not 'active offers'", async () => {
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.offers.map((o) => o.code)).toEqual(["CALM10"]);
    // The same rule, from the module checkout validates against.
    expect(discountUsable(tables.discount_codes[1]).ok).toBe(false);
    expect(discountUsable(tables.discount_codes[0]).ok).toBe(true);
  });

  it("checkout still refuses the codes the guard hides, with its own wording", async () => {
    tables.discount_codes = [tables.discount_codes[1]];
    const r = await validateDiscountCode(db(), "d1", "OLD20", 1000);
    expect(r).toEqual({ valid: false, error: "This code has expired" });
  });

  it("a business with no category saved is a 'business' — never a car dealership", async () => {
    tables.dealerships = [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "  " }];
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.category).toBe(UNKNOWN_CATEGORY);
    expect(f.categoryKnown).toBe(false);
    expect(formatFactsForCopy(f)).toMatch(/NOT SET by the owner.*don't assume an industry/);
    expect(describeBusiness(f)).toBe('"candle_by_qaaf", which sells Lavender candle, Mogra Nights candle');
  });

  it("a failed read is named as unknown, never silently 'none'", async () => {
    failing.add("products");
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.unreadable).toContain("products");
    expect(factsPrompt(f)).toMatch(/Couldn't be read right now.*products/);
  });

  it("the copy block states the real shipping, offers and stock", async () => {
    const text = formatFactsForCopy(await gatherBusinessFacts(db(), "d1"));
    expect(text).toContain("Lavender candle — ₹550");
    expect(text).toContain("Mogra Nights candle — ₹650 (out of stock)");
    expect(text).toContain("code CALM10 — 10% off");
    expect(text).toContain("₹60 flat on every order (NOT free)");
    expect(text).not.toContain("OLD20");
  });
});

describe("one catalogue, shared by the paths that used to query their own", () => {
  it("fetchCatalog returns the same shape gatherBusinessFacts uses, active only by default", async () => {
    tables.products.push({ id: "p3", name: "Retired candle", price: 400, images: [], inventory_count: null, is_active: false, order_index: 2 });
    const active = await fetchCatalog(db(), "d1");
    const facts = await gatherBusinessFacts(db(), "d1");
    expect(active).toEqual(facts.products);

    const all = await fetchCatalog(db(), "d1", { includeInactive: true });
    expect(all.map((p) => p.name)).toContain("Retired candle");
  });

  it("an unreadable catalogue is empty, not a thrown error, so a DM reply still sends", async () => {
    failing.add("products");
    expect(await fetchCatalog(db(), "d1")).toEqual([]);
  });

  it("matchProducts finds what a person named in chat", async () => {
    const catalog = await fetchCatalog(db(), "d1");
    expect(matchProducts(catalog, "lavender").map((p) => p.name)).toEqual(["Lavender candle"]);
    expect(matchProducts(catalog, "candle")).toHaveLength(2);
    expect(matchProducts(catalog, "")).toEqual([]);
  });

  it("Business Knowledge has one query, used by both the facts and the brain", async () => {
    const facts = await gatherBusinessFacts(db(), "d1");
    expect(await fetchKnowledgeFacts(db(), "d1")).toEqual(facts.ownerFacts);
  });
});

describe("getBusinessContext is built on the canonical facts", () => {
  it("chat, calls and DMs get the products, offers and shipping they never had", async () => {
    const ctx = await getBusinessContext(db(), "d1");
    expect(ctx.name).toBe("candle_by_qaaf");
    expect(ctx.category).toBe("Home fragrance");
    expect(ctx.toneOfVoice).toBe("warm and unhurried");
    expect(ctx.knowledgeFacts[0].title).toBe("Packaging");
    expect(ctx.facts!.products).toHaveLength(2);
    expect(ctx.facts!.shipping).toEqual({ mode: "flat", rate: 60, freeThreshold: null });
  });

  it("if the facts can't be gathered at all, identity still comes back — a call doesn't lose the business's name", async () => {
    const broken = { from: (t: string) => (t === "products" ? { select: () => { throw new Error("db down"); } } : db().from(t)) };
    const ctx = await getBusinessContext(broken, "d1");
    expect(ctx.facts).toBeNull();
    expect(ctx.name).toBe("candle_by_qaaf");
    expect(ctx.knowledgeFacts[0].title).toBe("Packaging");
  });
});

describe("images are anchored to the real product (Phase 3 check, before generation)", () => {
  const facts = async () => gatherBusinessFacts(db(), "d1");

  it("a festival brief that never names the product gets the hero subject added", async () => {
    const f = await facts();
    const brief = buildImageBrief("A warm Diwali celebration scene with diyas and rangoli", f);
    expect(brief.anchored).toBe(true);
    expect(brief.prompt).toContain("A warm Diwali celebration scene");
    expect(brief.prompt).toContain("The hero subject is this business's own product: Lavender candle");
    expect(brief.prompt).toContain("Do not substitute a different product");
  });

  it("a brief that already names the product is left exactly as written", async () => {
    const f = await facts();
    const brief = buildImageBrief("Lavender candle on a wooden table, Diwali mood", f);
    expect(brief.anchored).toBe(false);
    expect(brief.prompt).toBe("Lavender candle on a wooden table, Diwali mood");
  });

  it("the category alone counts as naming what they sell", async () => {
    const f = await facts();
    expect(mentionsProduct("Festive home fragrance flatlay", f)).toBe(true);
    expect(mentionsProduct("Generic festive lights and sweets", f)).toBe(false);
    expect(productTerms(f)).toContain("lavender");
  });

  it("the reference photo is the first product photo on file", async () => {
    const f = await facts();
    expect(heroProduct(f)!.name).toBe("Lavender candle");
    expect(buildImageBrief("Diwali post", f).referenceImageUrl).toBe("https://cdn.example/lavender.jpg");
  });

  it("with no products and no category, nothing is invented — the owner is told to fix it", async () => {
    tables.products = [];
    tables.dealerships = [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: null }];
    const brief = buildImageBrief("Diwali post", await gatherBusinessFacts(db(), "d1"));
    expect(brief.anchored).toBe(false);
    expect(brief.prompt).toBe("Diwali post");
    expect(brief.warning).toMatch(/add your products, or set your business category/);
  });

  it("the product photo is sent to the image model with the rule to match it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new TextEncoder().encode("photo-bytes").buffer,
    })));
    const brief = buildImageBrief("Diwali post", await facts());
    const parts = await imageParts(brief, "a square graphic");

    expect(parts[0].inline_data.mime_type).toBe("image/jpeg");
    expect(Buffer.from(parts[0].inline_data.data, "base64").toString()).toBe("photo-bytes");
    expect(parts[1].text).toMatch(/a square graphic[\s\S]*ACTUAL product/);
  });

  it("a photo that can't be fetched just means a text-only brief, never a failed generation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("cdn down"); }));
    expect(await fetchReferenceImage("https://cdn.example/lavender.jpg")).toBeNull();
    const parts = await imageParts(buildImageBrief("Diwali post", await facts()), "a square graphic");
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("a square graphic");
  });
});
