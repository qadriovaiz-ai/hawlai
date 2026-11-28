// THE ORDERS TAB MESSAGES AN INSTAGRAM CUSTOMER — O5, 28 November 2026.
// GET: what Instagram allows now, and a draft for the order's status.
// POST: send what the seller wrote, through the one function that may tag.

import { describe, it, expect, vi, beforeEach } from "vitest";

let order: any;
let lastCustomerAt: string | null;
const sends: any[] = [];
let sendResult: any;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const filters: Record<string, any> = {};
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => ((filters[c] = v), api),
        single: async () => ({ data: { dealership_id: "d1" }, error: null }),
        maybeSingle: async () => ({ data: table === "orders" && filters.dealership_id === "d1" ? order : null, error: null }),
      };
      return api;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: table === "dealerships" ? { dealership_name: "asha_crafts" } : { preferred_language: "english" }, error: null }),
      };
      return api;
    },
  }),
}));
vi.mock("@/lib/dm/thread", async (orig) => ({ ...(await orig<any>()), readDmThread: async () => ({ turns: [], lastCustomerAt }) }));
vi.mock("@/lib/dm/sellerMessage", async (orig) => ({
  ...(await orig<any>()),
  sendSellerMessage: async (...a: any[]) => (sends.push(a.slice(1)), sendResult),
}));

import { GET, POST } from "@/app/api/orders/[id]/message/route";

const params = { params: Promise.resolve({ id: "o1" }) };
const get = async () => {
  const r = await GET(new Request("https://hawlai.online/api/orders/o1/message"), params);
  return { status: r.status, body: await r.json() };
};
const post = async (body: any) => {
  const r = await POST(new Request("https://hawlai.online/api/orders/o1/message", { method: "POST", body: JSON.stringify(body) }), params);
  return { status: r.status, body: await r.json() };
};

beforeEach(() => {
  order = { id: "6b1f0c2e-0000-4000-8000-000000000042", channel: "instagram", status: "shipped", instagram_sender_id: "cust-1", upi_reference: "#6B1F0C" };
  lastCustomerAt = new Date(Date.now() - 2 * 3600_000).toISOString();
  sends.length = 0;
  sendResult = { ok: true, mode: "normal" };
});

describe("GET — what's allowed, and a draft", () => {
  it("A SHIPPED ORDER, CUSTOMER WROTE TODAY: ORDINARY MESSAGE, SHIPPED DRAFT WITH THE SHOP'S NAME", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ mode: "normal", why: null, draft: "Your order #6B1F0C has been shipped. Thank you for ordering from Asha Crafts!" });
  });

  it("TWO DAYS QUIET: ONLY AS THE SELLER PERSONALLY", async () => {
    lastCustomerAt = new Date(Date.now() - 48 * 3600_000).toISOString();
    expect((await get()).body.mode).toBe("human_agent");
  });

  it("OVER A WEEK: CLOSED, WITH THE REASON", async () => {
    lastCustomerAt = new Date(Date.now() - 8 * 24 * 3600_000).toISOString();
    expect((await get()).body).toMatchObject({ mode: "closed", why: expect.stringMatching(/more than 7 days/) });
  });

  it("A WEBSITE ORDER IS NOT MESSAGED FROM HERE; ANOTHER BUSINESS'S ORDER IS NOT FOUND", async () => {
    order.channel = "website";
    expect((await get()).status).toBe(400);
  });
});

describe("POST — the seller's own words, through the one function that tags", () => {
  it("SENDS TO THIS ORDER'S CUSTOMER, FOR THIS BUSINESS", async () => {
    const r = await post({ text: "Shipped today!" });
    expect(r).toMatchObject({ status: 200, body: { sent: true, mode: "normal" } });
    expect(sends).toEqual([["d1", "cust-1", "Shipped today!"]]);
  });

  it("SAYS SO WHEN IT WENT AS THE SELLER PERSONALLY", async () => {
    sendResult = { ok: true, mode: "human_agent" };
    expect((await post({ text: "Shipped!" })).body.note).toMatch(/as a message from you personally/);
  });

  it("A REFUSAL IS PASSED ON WITH ITS STATUS — never reported as sent", async () => {
    sendResult = { ok: false, error: "This customer last wrote more than 7 days ago…", status: 409 };
    const r = await post({ text: "Shipped!" });
    expect(r.status).toBe(409);
    expect(r.body.sent).toBeUndefined();
  });
});
