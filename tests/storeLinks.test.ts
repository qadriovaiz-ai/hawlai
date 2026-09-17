// Copy links only to the business's real storefront.
//
// THE LIVE CASE (2026-09-13): asked in chat for a promo email, Hawlai sent
// candle_by_qaaf's customer a button to
// "https://candlebyqaaf.com/products/lavender-candle". That domain does not
// exist (NXDOMAIN); the store is https://hawlai.online/site/candle-by-qaaf.
// The facts the AI writes from held no store address, so it made one up,
// and nothing checked links before the email went out.
//
// Now: the facts carry the real store and product links (only while the
// site is published), the rules forbid inventing any other, the claims
// guard flags foreign links, and send_email refuses a body that has one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, ilike: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: () => api, upsert: () => api, update: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

const STORE = (published = true): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow", business_address: "12 Hazratganj, Lucknow" }],
  leads: [{ id: "L1", dealership_id: "d1", email: "customer@example.com" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published, shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", is_active: true }],
  discount_codes: [],
  orders: [],
  business_knowledge: [{ category: "social", title: "Instagram", content: "Follow us at instagram.com/candle_by_qaaf", is_active: true }],
});

const sendDealerEmail = vi.fn(async (..._a: any[]) => ({ success: true, via: "resend" as const }));
vi.mock("@/lib/email/sendDealerEmail", () => ({ sendDealerEmail: (...a: any[]) => sendDealerEmail(...a) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { executeTool } from "@/lib/agents/masterBrainV2";
import { gatherBusinessFacts, formatFactsForCopy, COPY_TRUTH_RULES } from "@/lib/claims/businessFacts";
import { findUnsupportedLinks, findUnsupportedClaims, stripUnsupported } from "@/lib/claims/claimCheck";

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };
const STORE_URL = "https://hawlai.online/site/candle-by-qaaf";
const PRODUCT_URL = "https://hawlai.online/site/candle-by-qaaf/products/p1";
const LIVE_EMAIL = `Diwali is here! Light up your home with our Lavender candle.\n\nShop now: https://candlebyqaaf.com/products/lavender-candle`;

beforeEach(() => {
  tables = STORE();
  sendDealerEmail.mockClear();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the facts carry the real links", () => {
  it("a published store gets its hawlai.online address and a working link per product", async () => {
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.links).toEqual({ store: STORE_URL, products: [{ name: "Lavender candle", url: PRODUCT_URL }], booking: null });
  });

  it("an unpublished store gets no links — they would lead nowhere", async () => {
    tables = STORE(false);
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.links).toEqual({ store: null, products: [], booking: null });
    expect(formatFactsForCopy(f)).toContain("do not include any website link at all");
  });

  it("the copy facts print both links, and the rules forbid inventing any other", async () => {
    const block = formatFactsForCopy(await gatherBusinessFacts(db(), "d1"));
    expect(block).toContain(`Store link (the ONLY website address you may use): ${STORE_URL}`);
    expect(block).toContain(`Lavender candle — ${PRODUCT_URL}`);
    expect(COPY_TRUTH_RULES).toMatch(/NEVER invent a website address, domain or link/);
  });
});

describe("the guard flags links that aren't the business's own", () => {
  it("flags the live case and names the real store", async () => {
    const f = await gatherBusinessFacts(db(), "d1");
    const found = findUnsupportedLinks(LIVE_EMAIL, f);
    expect(found).toEqual([`a link to "https://candlebyqaaf.com/products/lavender-candle" — that isn't this business's website; the store is ${STORE_URL}`]);
    expect(findUnsupportedClaims(LIVE_EMAIL, f)).toEqual(found);
  });

  it.each(["www.candlebyqaaf.com", "candlebyqaaf.com", "visit candlebyqaaf.in today", "http://shop.example.store/x"])("flags %j", async (text) => {
    expect(findUnsupportedLinks(text, await gatherBusinessFacts(db(), "d1"))).toHaveLength(1);
  });

  it.each([
    `Shop now: ${STORE_URL}`,
    `Order here: ${PRODUCT_URL}.`,
    "Follow us at instagram.com/candle_by_qaaf",
    "Questions? Write to candlebyqaaf@gmail.com",
    "Hand-poured soy wax. Burns 40 hours.",
  ])("allows %j", async (text) => {
    expect(findUnsupportedLinks(text, await gatherBusinessFacts(db(), "d1"))).toEqual([]);
  });

  it("with no published site, even the hawlai.online link is flagged", async () => {
    tables = STORE(false);
    expect(findUnsupportedLinks(`Shop now: ${STORE_URL}`, await gatherBusinessFacts(db(), "d1"))).toEqual([
      `a link to "${STORE_URL}" — this business has no published website to link to`,
    ]);
  });

  it("generated copy loses the sentence with the fake link and keeps the rest", async () => {
    const { text } = stripUnsupported(LIVE_EMAIL, await gatherBusinessFacts(db(), "d1"));
    expect(text).toContain("Light up your home with our Lavender candle.");
    expect(text).not.toContain("candlebyqaaf.com");
  });
});

describe("send_email, through the real chat tool", () => {
  it("refuses the live email before anything is sent, and says what the real link is", async () => {
    const result = await executeTool(db(), CTX, "send_email", { recipient: "customer@example.com", subject: "Diwali offer", body: LIVE_EMAIL }, "");
    expect(sendDealerEmail).not.toHaveBeenCalled();
    expect(result.error).toContain("Not sent");
    expect(result.error).toContain("candlebyqaaf.com");
    expect(result.error).toContain(STORE_URL);
  });

  it("an email with the real product link isn't refused — it's shown to the owner to confirm, with that link intact", async () => {
    const body = `Light up your home with our Lavender candle.\n\nShop now: ${PRODUCT_URL}`;
    const result = await executeTool(db(), CTX, "send_email", { recipient: "customer@example.com", subject: "Diwali", body }, "");
    expect(result.error).toBeUndefined();
    expect(result.proposed).toBe(true);
    expect(result._emailPreview.text.startsWith(`${body}\n\n—\nCandle by Qaaf · 12 Hazratganj, Lucknow`)).toBe(true);
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });
});
