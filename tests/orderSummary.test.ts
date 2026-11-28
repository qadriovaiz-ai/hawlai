// THE ORDER SUMMARY BY CHANNEL — Stats, Seller Mode, 28 November 2026.
// The last 30 days, said on screen; each number means one thing.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { summariseOrders, SUMMARY_DAYS } from "@/lib/orders/summary";

const NOW = new Date("2026-11-28T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();

describe("1. WHAT EACH NUMBER COUNTS", () => {
  const rows = [
    { channel: "instagram", total: 950, payment_status: "paid", status: "confirmed", created_at: day(1) },
    { channel: "instagram", total: "450.50", payment_status: "pending", status: "new", created_at: day(2) },
    { channel: "instagram", total: 300, payment_status: "pending", status: "cancelled", created_at: day(3) },
    { channel: "website", total: 1200, payment_status: "pending", status: "new", created_at: day(4) },
    { channel: "website", total: 800, payment_status: "paid", status: "delivered", created_at: day(5) },
    { channel: null, total: 100, payment_status: "paid", status: "new", created_at: day(6) },
    { channel: "instagram", total: 9999, payment_status: "paid", status: "confirmed", created_at: day(SUMMARY_DAYS + 1) },
  ];

  it("INSTAGRAM: placed, paid, awaiting and cancelled — each counted once, the right way", () => {
    const ig = summariseOrders(rows, NOW).find((s) => s.channel === "instagram")!;
    expect(ig).toEqual({ channel: "instagram", orders: 3, cancelled: 1, paidCount: 1, paidAmount: 950, awaitingCount: 1, awaitingAmount: 450.5 });
  });

  it("A COD ORDER IS AWAITING PAYMENT, NOT PAID; AN ORDER WITH NO CHANNEL IS A WEBSITE ORDER", () => {
    const web = summariseOrders(rows, NOW).find((s) => s.channel === "website")!;
    expect(web).toEqual({ channel: "website", orders: 3, cancelled: 0, paidCount: 2, paidAmount: 900, awaitingCount: 1, awaitingAmount: 1200 });
  });

  it("ONLY THE LAST 30 DAYS — an older order is not in any number", () => {
    const all = summariseOrders(rows, NOW);
    expect(all.reduce((n, s) => n + s.orders, 0)).toBe(6);
    expect(all.some((s) => s.paidAmount >= 9999)).toBe(false);
  });

  it("A CANCELLED ORDER IS NEVER MONEY — paid or not", () => {
    const s = summariseOrders([{ channel: "instagram", total: 500, payment_status: "paid", status: "cancelled", created_at: day(1) }], NOW)[1];
    expect(s).toMatchObject({ orders: 1, cancelled: 1, paidAmount: 0, awaitingAmount: 0 });
  });

  it("RUPEES TO THE PAISA, and an unreadable total counts as nothing rather than NaN", () => {
    const s = summariseOrders(
      [
        { channel: "website", total: 0.1, payment_status: "paid", status: "new", created_at: day(1) },
        { channel: "website", total: 0.2, payment_status: "paid", status: "new", created_at: day(1) },
        { channel: "website", total: "abc", payment_status: "paid", status: "new", created_at: day(1) },
      ],
      NOW
    )[0];
    expect(s.paidAmount).toBe(0.3);
    expect(s.paidCount).toBe(3);
  });
});

// ---- the route ------------------------------------------------------------
let summaryError: any;
let calls: { table: string; filters: Record<string, any>; gte?: any }[];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const c: any = { table, filters: {} };
      let summaryQuery = false;
      const api: any = {
        select: (cols: string) => ((summaryQuery = cols.startsWith("channel, total")), api),
        eq: (k: string, v: any) => ((c.filters[k] = v), api),
        gte: (k: string, v: any) => ((c.gte = v), api),
        order: () => api,
        limit: async () => (calls.push(c), { data: [{ id: "o1" }], error: null }),
        single: async () => ({ data: { dealership_id: "d1" }, error: null }),
        then: (res: any) => (calls.push(c), Promise.resolve(summaryQuery && summaryError ? { data: null, error: summaryError } : { data: [{ channel: "instagram", total: 950, payment_status: "paid", status: "confirmed", created_at: new Date().toISOString() }], error: null }).then(res)),
      };
      return api;
    },
  }),
}));

import { GET } from "@/app/api/orders/route";

describe("2. THE ORDERS ROUTE CARRIES IT", () => {
  beforeEach(() => {
    summaryError = null;
    calls = [];
  });

  it("THE SUMMARY IS ITS OWN QUERY, FOR THIS BUSINESS, OVER THE PERIOD — not the 200 listed", async () => {
    const d = await (await GET()).json();
    expect(d.summaryDays).toBe(SUMMARY_DAYS);
    expect(d.summary[1]).toMatchObject({ channel: "instagram", orders: 1, paidAmount: 950 });
    const q = calls.find((c) => c.gte)!;
    expect(q.filters).toEqual({ dealership_id: "d1" });
    expect(Date.now() - new Date(q.gte).getTime()).toBeGreaterThan((SUMMARY_DAYS - 1) * 86400_000);
  });

  it("A SUMMARY THAT CAN'T BE READ IS null — the list still comes back", async () => {
    summaryError = { message: "boom" };
    const d = await (await GET()).json();
    expect(d.summary).toBeNull();
    expect(d.orders).toEqual([{ id: "o1" }]);
  });
});
