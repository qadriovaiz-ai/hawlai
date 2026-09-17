// Services in the catalogue, and prices the claims check can't verify —
// industry-agnostic overhaul, Phase 2.
//
// APPROVED 2026-09-17:
//  - Services live on the products table as a flag (migration 188): a
//    service is booked, not bought — no cart, no stock, no shipping, no
//    shopping feed — and every AI is told what the business OFFERS, not
//    "Products: none listed".
//  - A price the check can't match is REMOVED from anything published
//    with nobody reading it first, and KEPT WITH A WARNING in a draft the
//    owner reviews. Prices the business states itself (site, Business
//    Knowledge) count as real.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { cleanBookingUrl, cleanDuration, formatDuration, serviceBookingHref, serviceFieldsFromBody } from "@/lib/catalog/catalogItem";
import { toStorefrontProduct } from "@/lib/catalog/storefrontCatalog";
import { gatherBusinessFacts, formatFactsForCopy, type BusinessFacts, type CatalogProduct } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims, findUnsupportedLinks, guardGenerated, moneyAmounts, stripUnsupported } from "@/lib/claims/claimCheck";
import { composeMarketingEmail } from "@/lib/email/composeEmail";
import { buildImageBrief } from "@/lib/claims/imageBrief";
import { effectiveBusinessModels } from "@/lib/business/businessModel";
import { resolveOrderPricing } from "@/lib/orderPricing";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

// ---- a small in-memory Supabase ----------------------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row }[];

function fakeSupabase(user: { id: string } | null = { id: "u1" }) {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    let head = false;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert") {
        const row = { id: `${table}-new`, ...payload };
        writes.push({ table, op, values: payload });
        (tables[table] ??= []).push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        writes.push({ table, op, values: payload });
        const hit = rows();
        for (const r of hit) Object.assign(r, payload);
        return { data: single ? hit[0] ?? null : hit, error: null };
      }
      const found = rows();
      if (head) return { data: null, count: found.length, error: null };
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: (_c?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), api),
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      neq: (k: string, v: any) => (filters.push((r) => r[k] !== v), api),
      gte: (k: string, v: any) => (filters.push((r) => r[k] == null || r[k] >= v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      order: () => api,
      limit: () => api,
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabase() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => fakeSupabase() }));

beforeEach(() => {
  tables = {};
  writes = [];
});

// ---- facts fixture ----------------------------------------------------------
const lavender: CatalogProduct = { id: "p1", name: "Lavender candle", kind: "product", price: 550, description: "Soy wax", images: ["https://img.test/candle.jpg"], inventory: null, category: null, active: true };
const facial: CatalogProduct = { id: "s1", name: "Hydra facial", kind: "service", durationMinutes: 60, bookingUrl: null, price: 2500, description: "Deep cleanse", images: ["https://img.test/room.jpg"], inventory: null, category: null, active: true };

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Glow Studio",
    category: "Skin clinic",
    categoryKnown: true,
    businessModels: { models: ["services"], inferred: false },
    city: "Pune",
    site: { url: "/site/glow", published: true, pages: [] },
    home: null,
    products: [facial],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 0, leads: 3 },
    ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: "https://hawlai.online/site/glow", products: [{ name: "Hydra facial", url: "https://hawlai.online/site/glow/products/s1" }], booking: "https://hawlai.online/book/glow" },
    season: seasonFor([], "2026-07-01"),
    unreadable: [],
    ...over,
  };
}

// ---- item rules ----------------------------------------------------------------
describe("a catalogue item is a product or a service", () => {
  it("accepts only http(s) booking links", () => {
    expect(cleanBookingUrl("https://calendly.com/glow")).toEqual({ ok: true, value: "https://calendly.com/glow" });
    expect(cleanBookingUrl("")).toEqual({ ok: true, value: null });
    expect(cleanBookingUrl("javascript:alert(1)")).toEqual({ ok: false });
    expect(cleanBookingUrl("calendly.com/glow")).toEqual({ ok: false });
  });

  it("accepts whole-minute durations up to a day", () => {
    expect(cleanDuration("45")).toEqual({ ok: true, value: 45 });
    expect(cleanDuration("")).toEqual({ ok: true, value: null });
    expect(cleanDuration("1.5")).toEqual({ ok: false });
    expect(cleanDuration("0")).toEqual({ ok: false });
    expect(cleanDuration("1441")).toEqual({ ok: false });
    expect([formatDuration(45), formatDuration(60), formatDuration(90), formatDuration(null)]).toEqual(["45 min", "1 hr", "1 hr 30 min", null]);
  });

  it("a service carries no stock; turning an item back into a product clears its booking fields", () => {
    expect(serviceFieldsFromBody({ kind: "service", durationMinutes: "30" })).toEqual({ ok: true, update: { kind: "service", duration_minutes: 30, inventory_count: null } });
    expect(serviceFieldsFromBody({ kind: "product" }, { kind: "service" })).toEqual({ ok: true, update: { kind: "product", duration_minutes: null, booking_url: null } });
    expect(serviceFieldsFromBody({ kind: "gift" })).toEqual({ ok: false, error: expect.any(String) });
  });

  it("Book goes to the service's own link, else the business's booking page", () => {
    expect(serviceBookingHref({ booking_url: "https://cal.test/x" }, "/book/glow")).toBe("https://cal.test/x");
    expect(serviceBookingHref({ booking_url: null }, "/book/glow")).toBe("/book/glow");
    expect(serviceBookingHref({}, null)).toBeNull();
  });
});

// ---- products API -------------------------------------------------------------
describe("products API saves services", () => {
  beforeEach(() => {
    tables.profiles = [{ id: "u1", dealership_id: "biz-1" }];
    tables.products = [];
  });
  const req = (body: Row, method = "POST") => new Request("https://x.test/api/products", { method, body: JSON.stringify(body) });

  it("creates a service with its duration and link, and no stock even if stock was sent", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(req({ name: "Hydra facial", price: "2500", kind: "service", durationMinutes: "60", bookingUrl: "https://cal.test/glow", inventoryCount: "5" }));
    expect(res.status).toBe(200);
    expect(tables.products[0]).toMatchObject({ dealership_id: "biz-1", kind: "service", duration_minutes: 60, booking_url: "https://cal.test/glow", inventory_count: null });
  });

  it("rejects a booking link that isn't a web address", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(req({ name: "Facial", price: "100", kind: "service", bookingUrl: "javascript:alert(1)" }));
    expect(res.status).toBe(400);
    expect(tables.products).toHaveLength(0);
  });

  it("an item with no kind is saved as a product", async () => {
    const { POST } = await import("@/app/api/products/route");
    await POST(req({ name: "Lavender candle", price: "550", inventoryCount: "4" }));
    expect(tables.products[0]).toMatchObject({ kind: "product", inventory_count: 4 });
  });

  it("an update can't give an existing service stock, and only touches this business's item", async () => {
    tables.products = [
      { id: "s1", dealership_id: "biz-1", kind: "service", inventory_count: null },
      { id: "s2", dealership_id: "biz-2", kind: "service", inventory_count: null },
    ];
    const { PATCH } = await import("@/app/api/products/[id]/route");
    await PATCH(req({ inventoryCount: "9" }, "PATCH"), { params: Promise.resolve({ id: "s1" }) });
    expect(tables.products[0].inventory_count).toBeNull();
    await PATCH(req({ kind: "product" }, "PATCH"), { params: Promise.resolve({ id: "s2" }) });
    expect(tables.products[1].kind).toBe("service");
  });
});

// ---- checkout and feeds ----------------------------------------------------------
describe("a service is booked, not bought", () => {
  it("checkout refuses a service in the cart", async () => {
    tables.websites = [{ id: "w1", slug: "glow", published: true, dealership_id: "biz-1", shipping_mode: "flat", shipping_rate: 60 }];
    tables.products = [{ id: "s1", dealership_id: "biz-1", name: "Hydra facial", price: 2500, is_active: true, inventory_count: null, kind: "service" }];
    const r = await resolveOrderPricing(fakeSupabase(), "glow", [{ productId: "s1", quantity: 1 }]);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect((r as any).error).toMatch(/booked/);
  });

  it("checkout still sells products", async () => {
    tables.websites = [{ id: "w1", slug: "glow", published: true, dealership_id: "biz-1", shipping_mode: "flat", shipping_rate: 60 }];
    tables.products = [{ id: "p1", dealership_id: "biz-1", name: "Candle", price: 550, is_active: true, inventory_count: null, kind: "product" }];
    expect(await resolveOrderPricing(fakeSupabase(), "glow", [{ productId: "p1", quantity: 1 }])).toMatchObject({ ok: true, total: 610 });
  });

  it("shopping feeds leave services out", async () => {
    tables.websites = [{ slug: "glow", published: true, dealership_id: "biz-1", dealerships: { dealership_name: "Glow" } }];
    tables.products = [
      { id: "p1", dealership_id: "biz-1", name: "Candle", description: "Soy", price: 550, images: ["https://img.test/c.jpg"], inventory_count: null, is_active: true, kind: "product", condition: "new" },
      { id: "s1", dealership_id: "biz-1", name: "Hydra facial", description: "Deep", price: 2500, images: ["https://img.test/f.jpg"], inventory_count: null, is_active: true, kind: "service", condition: "new" },
    ];
    const { GET } = await import("@/app/api/feeds/[platform]/[slug]/route");
    const body = await (await GET(new Request("https://x.test/feed"), { params: Promise.resolve({ platform: "google", slug: "glow" }) })).text();
    expect(body).toContain("Candle");
    expect(body).not.toContain("Hydra facial");
  });
});

// ---- storefront -------------------------------------------------------------------
describe("the store shows Book for a service", () => {
  it("renders Book now with the booking destination instead of Add to Cart", async () => {
    const { default: ProductCatalog } = await import("@/components/website/ProductCatalog");
    const { getTheme } = await import("@/lib/landingThemes");
    const items = [
      toStorefrontProduct({ id: "s1", name: "Hydra facial", price: 2500, images: [], kind: "service", duration_minutes: 60, inventory_count: 3 }, "glow"),
      toStorefrontProduct({ id: "p1", name: "Candle", price: 550, images: [], kind: "product", inventory_count: 2 }, "glow"),
    ];
    const html = renderToStaticMarkup(createElement(ProductCatalog, { products: items, slug: "glow", theme: getTheme(undefined as any) }));
    expect(html).toContain('href="/book/glow"');
    expect(html).toContain("Book now");
    expect(html).toContain("1 hr");
    expect((html.match(/Add to Cart/g) ?? []).length).toBe(1);
  });

  it("with nowhere to book, says so rather than showing a dead button", async () => {
    const { default: ProductCatalog } = await import("@/components/website/ProductCatalog");
    const { getTheme } = await import("@/lib/landingThemes");
    const html = renderToStaticMarkup(createElement(ProductCatalog, { products: [toStorefrontProduct({ id: "s1", name: "Facial", price: 1, images: [], kind: "service" }, null)], slug: "glow", theme: getTheme(undefined as any) }));
    expect(html).toContain("Contact us to book");
    expect(html).not.toContain("Add to Cart");
  });
});

// ---- facts ----------------------------------------------------------------------
describe("business facts say what the business offers", () => {
  function seed(items: Row[], dealership: Row = {}) {
    tables.dealerships = [{ id: "biz-1", dealership_name: "Glow Studio", business_category: "Skin clinic", business_models: [], booking_slug: "glow", ...dealership }];
    tables.websites = [{ id: "w1", dealership_id: "biz-1", slug: "glow", published: true, shipping_mode: "flat", shipping_rate: 60 }];
    tables.products = items.map((i, n) => ({ id: `i${n}`, dealership_id: "biz-1", is_active: true, images: [], order_index: n, ...i }));
  }

  it("a services-only business: services listed as booked, no shipping, booking link, guessed as services", async () => {
    seed([{ name: "Hydra facial", price: 2500, kind: "service", duration_minutes: 60 }]);
    const f = await gatherBusinessFacts(fakeSupabase(), "biz-1");
    const text = formatFactsForCopy(f);
    expect(f.businessModels).toEqual({ models: ["services"], inferred: true });
    expect(text).toContain("Services (1, booked — not bought or shipped): Hydra facial — ₹2500 (1 hr)");
    expect(text).not.toMatch(/Products: none|Products \(/);
    expect(text).toContain("Shipping: not applicable");
    expect(text).toContain("Hydra facial — https://hawlai.online/book/glow");
  });

  it("a business with both lists them separately and keeps shipping", async () => {
    seed([{ name: "Candle", price: 550, kind: "product" }, { name: "Facial", price: 2500, kind: "service" }]);
    const f = await gatherBusinessFacts(fakeSupabase(), "biz-1");
    const text = formatFactsForCopy(f);
    expect(text).toContain("Products (1): Candle — ₹550");
    expect(text).toContain("Services (1, booked — not bought or shipped): Facial — ₹2500");
    expect(text).toContain("Shipping: ₹60 flat");
    expect(f.businessModels.models).toEqual(["products", "services"]);
  });

  it("an empty catalogue says nothing is listed, not 'no products'", async () => {
    seed([]);
    expect(formatFactsForCopy(await gatherBusinessFacts(fakeSupabase(), "biz-1"))).toContain("What it offers: nothing listed in the catalogue yet.");
  });

  it("guesses services from the catalogue when the owner hasn't said", () => {
    expect(effectiveBusinessModels([], { productCount: 0, serviceCount: 2 })).toEqual({ models: ["services"], inferred: true });
    expect(effectiveBusinessModels(["b2b"], { productCount: 3, serviceCount: 2 })).toEqual({ models: ["b2b"], inferred: false });
  });
});

// ---- prices ------------------------------------------------------------------------
describe("prices: any rupee amount must be on record", () => {
  it.each([
    ["Book a facial for just ₹1,999.", 1999],
    ["Sessions from Rs. 800 only", 800],
    ["Packages at INR 3,000", 3000],
    ["Corporate plan ₹1.5 lakh a year", 150000],
    ["Only 499/- per class", 499],
    ["Just 700 rupees", 700],
  ])("catches %s", (text, value) => {
    expect(moneyAmounts(text)).toContain(value);
    expect(findUnsupportedClaims(text, facts()).some((r) => r.includes("no product, service"))).toBe(true);
  });

  it("allows the real price of a service, however it's written", () => {
    expect(findUnsupportedClaims("Hydra facial, ₹2,500 for an hour.", facts())).toEqual([]);
    expect(findUnsupportedClaims("Hydra facial at Rs 2500.00", facts())).toEqual([]);
  });

  it("allows a price the owner states in Business Knowledge or on the site", () => {
    const f = facts({ ownerFacts: [{ category: "pricing", title: "Consultation", content: "First consultation fee is Rs. 500" }] });
    expect(findUnsupportedClaims("Your first consultation is just ₹500.", f)).toEqual([]);
    const onSite = facts({ site: { url: "/site/glow", published: true, pages: [{ slug: "home", title: "Home", pageType: "home", headings: ["Bridal packages from ₹15,000"], paragraphs: [], buttons: [], metaDescription: null, hasShareImage: false }] } });
    expect(findUnsupportedClaims("Bridal packages start at ₹15,000.", onSite)).toEqual([]);
  });

  it("a discount isn't read as a price ('₹2,000 off' stays a discount claim)", () => {
    const reasons = findUnsupportedClaims("Get ₹2,000 off today.", facts());
    expect(reasons.some((r) => r.includes("no active discount code gives ₹2000 off"))).toBe(true);
    expect(reasons.some((r) => r.includes("no product, service"))).toBe(false);
  });

  it("a services-only business can't promise free shipping", () => {
    expect(findUnsupportedClaims("Free delivery on every booking!", facts())).toEqual([expect.stringContaining("sells services, nothing is shipped")]);
  });

  it("a booking link is a link the business owns", () => {
    expect(findUnsupportedLinks("Book here: https://hawlai.online/book/glow", facts())).toEqual([]);
    const own = facts({ products: [{ ...facial, bookingUrl: "https://calendly.com/glow-studio" }] });
    expect(findUnsupportedLinks("Book at https://calendly.com/glow-studio", own)).toEqual([]);
    expect(findUnsupportedLinks("Book at https://calendly.com/someone-else", facts())).not.toEqual([]);
    // The booking page works without a published website.
    const noSite = facts({ links: { store: null, products: [], booking: "https://hawlai.online/book/glow" } });
    expect(findUnsupportedLinks("Book here: https://hawlai.online/book/glow", noSite)).toEqual([]);
  });
});

describe("unverified prices: removed when published, flagged in drafts", () => {
  const copy = "Glow up this season. Hydra facial now just ₹1,999. Rated 4.9/5 by clients.";

  it("publish (the default) removes the price sentence and the invented rating", () => {
    const r = stripUnsupported(copy, facts());
    expect(r.text).toBe("Glow up this season.");
    expect(r.priceWarnings).toEqual([]);
    expect(r.removed.some((x) => x.includes("₹1,999"))).toBe(true);
  });

  it("draft keeps the price sentence with a warning, but still removes the rating", () => {
    const r = stripUnsupported(copy, facts(), "draft");
    expect(r.text).toBe("Glow up this season. Hydra facial now just ₹1,999.");
    expect(r.priceWarnings).toEqual([expect.stringContaining("₹1,999")]);
    expect(r.removed).toEqual(["a star rating — Hawlai has no rating data for this business"]);
  });

  it("a sentence with a price AND another claim is removed even in a draft", () => {
    const r = stripUnsupported("Guaranteed glow, only ₹1,999.", facts(), "draft");
    expect(r.text).toBe("");
    expect(r.priceWarnings).toEqual([]);
  });

  it("the draft note tells the owner to check the price and how to make it recognised", () => {
    const g = guardGenerated({ caption: "Hydra facial now just ₹1,999." }, facts(), "draft");
    expect(g.output.caption).toBe("Hydra facial now just ₹1,999.");
    expect(g.output._claimsNote).toMatch(/Check this price before you use this/);
    expect(g.output._claimsNote).toMatch(/Business Knowledge/);
    expect(g.removed).toEqual([]);
  });
});

describe("generators: automation stays strict, owner drafts are flagged", () => {
  const anthropic = (json: Row) =>
    vi.fn(async () => new Response(JSON.stringify({ content: [{ text: JSON.stringify(json) }], usage: {} }), { status: 200 }));

  afterEach(() => vi.unstubAllGlobals());

  it("an automated email (default mode) has the unverified price removed, so automation won't send it", async () => {
    vi.stubGlobal("fetch", anthropic({ subject: "Glow Studio: your facial", headline: "Hi", intro: "Hydra facial for just ₹1,999.", ctaLabel: "Book a facial", product: "Hydra facial", body: "Hydra facial for just ₹1,999." }));
    const { generateEmailContent } = await import("@/lib/agents/emailMarketingAgent");
    const r = await generateEmailContent("promotional", "Glow Studio", "Skin clinic", "facials", null, undefined, undefined, facts());
    expect(r.claimsRemoved?.length).toBeGreaterThan(0);
    expect(r.output.intro).toBe("");
  });

  it("the same email as an owner draft keeps the price and says to check it", async () => {
    vi.stubGlobal("fetch", anthropic({ subject: "Glow Studio: your facial", headline: "Hi", intro: "Hydra facial for just ₹1,999.", ctaLabel: "Book a facial", product: "Hydra facial", body: "Hydra facial for just ₹1,999." }));
    const { generateEmailContent } = await import("@/lib/agents/emailMarketingAgent");
    const r = await generateEmailContent("promotional", "Glow Studio", "Skin clinic", "facials", null, undefined, undefined, facts(), "draft");
    expect(r.output.intro).toBe("Hydra facial for just ₹1,999.");
    expect(r.priceWarnings).toHaveLength(1);
    expect(r.output._claimsNote).toMatch(/Check this price/);
  });

  it("the Social page's caption route asks for a draft", async () => {
    tables.profiles = [{ id: "u1", dealership_id: "biz-1" }];
    tables.dealerships = [{ id: "biz-1", business_category: "Skin clinic" }];
    const gen = vi.fn(async () => ({ caption: "x", claimsRemoved: [], priceWarnings: ["p"] }));
    vi.doMock("@/lib/agents/socialMediaAgent", () => ({ generateSocialCaption: gen }));
    vi.resetModules();
    const { POST } = await import("@/app/api/social/generate-caption/route");
    const res = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ prompt: "facial post" }) }));
    expect((gen.mock.calls[0] as any[])[5]).toBe("draft");
    expect((await res.json()).note).toMatch(/Check this price/);
    vi.doUnmock("@/lib/agents/socialMediaAgent");
    vi.resetModules();
  });
});

// ---- email button and images -------------------------------------------------------
describe("email buttons and images fit a service", () => {
  it("an email about a service books it: the booking page, labelled Book", () => {
    const e = composeMarketingEmail({ subject: "Facials", headline: "Glow", intro: "Try it.", product: "Hydra facial" }, facts());
    expect(e.design.cta).toEqual({ label: "Book Hydra facial", url: "https://hawlai.online/book/glow" });
  });

  it("a service's own booking link wins over the booking page", () => {
    const f = facts({ products: [{ ...facial, bookingUrl: "https://calendly.com/glow-studio" }] });
    expect(composeMarketingEmail({ subject: "Facials", product: "Hydra facial", ctaLabel: "Book a facial" }, f).design.cta).toEqual({ label: "Book a facial", url: "https://calendly.com/glow-studio" });
  });

  it("an email about a product still shops it", () => {
    const f = facts({ products: [lavender], links: { store: "https://hawlai.online/site/c", products: [{ name: "Lavender candle", url: "https://hawlai.online/site/c/products/p1" }], booking: null } });
    expect(composeMarketingEmail({ subject: "Candles", product: "Lavender candle" }, f).design.cta).toEqual({ label: "Shop Lavender candle", url: "https://hawlai.online/site/c/products/p1" });
  });

  it("a services-only business still gets an image anchor, without copying a room photo as a product", () => {
    const b = buildImageBrief("Diwali greeting post", facts());
    expect(b.anchored).toBe(true);
    expect(b.prompt).toContain("this business's own service: Hydra facial");
    expect(b.referenceImageUrl).toBeNull();
    expect(b.warning).toBeNull();
  });

  it("a business with products and services anchors to the product photo", () => {
    const b = buildImageBrief("Diwali greeting post", facts({ products: [facial, lavender] }));
    expect(b.prompt).toContain("own product: Lavender candle");
    expect(b.referenceImageUrl).toBe("https://img.test/candle.jpg");
  });
});

describe("the migration", () => {
  it("adds the flag with every existing item a product, and constrains the new fields", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/188_catalog_services.sql", "utf8");
    expect(sql).toMatch(/add column if not exists kind text not null default 'product'/);
    expect(sql).toMatch(/check \(kind in \('product', 'service'\)\)/);
    expect(sql).toMatch(/booking_url ~\* '\^https\?:\/\/'/);
    expect(sql).not.toMatch(/drop column|delete from|update products/i);
  });
});
