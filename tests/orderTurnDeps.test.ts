// THE DATABASE BEHIND AN INSTAGRAM ORDER CONVERSATION — O1, 28 November
// 2026. The decisions live in orderConversation.ts; this pins the
// plumbing they rely on: the yes is claimed CONDITIONALLY, a draft that
// cannot be read is an error and not "no order", and the order is placed
// at the exact total the customer was shown.

import { describe, it, expect, vi, beforeEach } from "vitest";

const pricingCalls: any[] = [];
const orderCalls: any[] = [];
const noticeCalls: any[] = [];
vi.mock("@/lib/orderPricing", () => ({
  resolveBusinessOrderPricing: async (...a: any[]) => (pricingCalls.push(a.slice(1)), { ok: true, total: 1 }),
}));
vi.mock("@/lib/orders/createDmOrder", () => ({ createDmOrder: async (_s: any, input: any) => (orderCalls.push(input), { ok: true }) }));
vi.mock("@/lib/dm/sellerOrderNotice", () => ({ notifySellerOfOrder: async (_s: any, d: string, n: any) => noticeCalls.push([d, n]) }));
vi.mock("@/lib/email/consent", () => ({ siteUrl: () => "https://example.test" }));
const cards: any[] = [];
let cardFails = false;
vi.mock("@/lib/chat/requestApproval", () => ({
  requestApproval: async (_s: any, d: string, req: any) => (cards.push([d, req]), cardFails ? { error: "insert refused" } : { needsApproval: true, approvalId: "ap-1" }),
}));

import { buildOrderTurnDeps } from "@/lib/dm/orderTurnDeps";

let ops: { table: string; op: string; arg?: any; filters: Record<string, any>; opts?: any }[];
let readResult: { data: any; error: any };
let claimRows: any[];
let feeRow: any;

function db() {
  return {
    from: (table: string) => {
      const filters: Record<string, any> = {};
      let op = "select";
      let arg: any;
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => ((filters[c] = v), api),
        maybeSingle: async () => {
          ops.push({ table, op: "read", filters });
          return table === "dealerships" ? { data: feeRow, error: null } : readResult;
        },
        upsert: async (row: any, opts: any) => {
          ops.push({ table, op: "upsert", arg: row, filters, opts });
          return { error: null };
        },
        update: (row: any) => {
          op = "update";
          arg = row;
          return api;
        },
        then: (res: any) => {
          ops.push({ table, op, arg, filters });
          return Promise.resolve({ data: claimRows, error: null }).then(res);
        },
      };
      return api;
    },
  };
}

const NOW = new Date("2026-11-28T12:00:00Z");
const ctx = {
  dealershipId: "d1",
  dealershipName: "asha_crafts",
  upiVpa: "shop@okhdfcbank",
  senderId: "cust-1",
  language: "english" as const,
  catalog: [
    { id: "p1", name: "Clay Mug", price: 450, kind: "product", active: true },
    { id: "s1", name: "Pottery Class", price: 900, kind: "service", active: true },
    { id: "p2", name: "Old Vase", price: 300, kind: "product", active: false },
    { id: null, name: "Unsaved", price: 1, kind: "product", active: true },
  ] as any,
  turns: [],
  now: NOW,
};

beforeEach(() => {
  ops = [];
  readResult = { data: null, error: null };
  claimRows = [{ id: "r1" }];
  feeRow = { seller_shipping_fee: 60 };
  pricingCalls.length = 0;
  orderCalls.length = 0;
  noticeCalls.length = 0;
  cards.length = 0;
  cardFails = false;
});

describe("what can be ordered", () => {
  it("ONLY ACTIVE PRODUCTS WITH AN ID — a service is booked, never ordered", () => {
    expect(buildOrderTurnDeps(db(), ctx).catalog).toEqual([{ id: "p1", name: "Clay Mug" }]);
  });
});

describe("the draft", () => {
  it("READ FOR THIS BUSINESS, THIS CHANNEL, THIS CUSTOMER", async () => {
    readResult = { data: { id: "r1", draft: { name: "Asha" }, status: "open" }, error: null };
    const row = await buildOrderTurnDeps(db(), ctx).loadDraft();
    expect(ops[0].filters).toEqual({ dealership_id: "d1", channel: "instagram", sender_id: "cust-1" });
    // A stored draft missing fields is completed with empty ones.
    expect(row!.draft).toEqual({ items: [], name: "Asha", phone: null, address: null });
  });

  it("A DRAFT THAT CAN'T BE READ IS AN ERROR — never 'no order in progress'", async () => {
    readResult = { data: null, error: { message: "boom" } };
    await expect(buildOrderTurnDeps(db(), ctx).loadDraft()).rejects.toThrow(/Couldn't read the order in progress/);
  });

  it("SAVED AS ONE ROW PER CONVERSATION, stamped now", async () => {
    await buildOrderTurnDeps(db(), ctx).saveDraft({ status: "open" });
    const up = ops.find((o) => o.op === "upsert")!;
    expect(up.arg).toEqual({ dealership_id: "d1", channel: "instagram", sender_id: "cust-1", status: "open", updated_at: NOW.toISOString() });
    expect(up.opts).toEqual({ onConflict: "dealership_id,channel,sender_id" });
  });
});

describe("the yes", () => {
  it("IS CLAIMED ONLY IF THE READ-BACK SHOWN IS STILL THE ONE THERE", async () => {
    const ok = await buildOrderTurnDeps(db(), ctx).claimReadback("2026-11-28T11:59:00.000Z");
    const claim = ops.find((o) => o.op === "update")!;
    expect(claim.arg).toEqual({ readback_sent_at: null, updated_at: NOW.toISOString() });
    expect(claim.filters).toEqual({ dealership_id: "d1", channel: "instagram", sender_id: "cust-1", readback_sent_at: "2026-11-28T11:59:00.000Z" });
    expect(ok).toBe(true);
  });

  it("A SECOND DELIVERY FINDS NOTHING TO CLAIM", async () => {
    claimRows = [];
    expect(await buildOrderTurnDeps(db(), ctx).claimReadback("x")).toBe(false);
  });

  it("THE ORDER IS PLACED AT THE TOTAL THE CUSTOMER WAS SHOWN", async () => {
    await buildOrderTurnDeps(db(), ctx).placeOrder({
      lines: [{ productId: "p1", quantity: 2 }],
      items: [],
      subtotal: 900,
      shippingAmount: 60,
      total: 960,
      name: "Asha",
      phone: "9800000001",
      address: "12 Lake Road",
    });
    expect(orderCalls[0]).toEqual({
      dealershipId: "d1",
      instagramSenderId: "cust-1",
      customerName: "Asha",
      customerPhone: "9800000001",
      shippingAddress: "12 Lake Road",
      items: [{ productId: "p1", quantity: 2 }],
      expectedTotal: 960,
    });
  });
});

describe("prices, payment and the seller", () => {
  it("PRICED WITH THE SELLER MODE DELIVERY FEE", async () => {
    await buildOrderTurnDeps(db(), ctx).price([{ productId: "p1", quantity: 1 }]);
    expect(pricingCalls[0]).toEqual(["d1", [{ productId: "p1", quantity: 1 }], null, 60]);
  });

  it("THE PAYMENT REQUEST PAYS THE SELLER'S UPI ID, AS THE BUSINESS'S NAME, WITH THE QR FROM THE API ROUTE", () => {
    const pay = buildOrderTurnDeps(db(), ctx).paymentRequest({ ok: true, orderId: "6b1f0c2e-0000-4000-8000-000000000042", reference: "#6B1F0C", items: [], subtotal: 900, discountAmount: 0, shippingAmount: 60, total: 960, customerName: "Asha" });
    expect(pay.text).toContain("UPI ID: shop@okhdfcbank (Asha Crafts)");
    expect(pay.text).toContain("₹960");
    expect(pay.text).toMatch(/QR code/);
    expect(pay.qrUrl).toBe("https://example.test/api/public/pay/upi-qr/6b1f0c2e-0000-4000-8000-000000000042");
  });

  it("THE SELLER'S PAYMENT CARD IS RAISED FIRST — one approval per order, carrying the order id (O3)", async () => {
    await buildOrderTurnDeps(db(), ctx).notifySeller({ ok: true, orderId: "o1", reference: "#ABC", items: [], subtotal: 900, discountAmount: 0, shippingAmount: 60, total: 960, customerName: "Asha" });
    expect(cards).toEqual([
      ["d1", expect.objectContaining({ actionType: "confirm_dm_payment", details: { order_id: "o1", order_ref: "#ABC" }, amount: 960, requestedBy: "seller_mode" })],
    ]);
    expect(cards[0][1].confirm).toMatch(/received ₹960 .* order #ABC from Asha/);
  });

  it("A CARD THAT COULDN'T BE MADE STILL TELLS THE SELLER — the Orders tab can confirm it", async () => {
    cardFails = true;
    await buildOrderTurnDeps(db(), ctx).notifySeller({ ok: true, orderId: "o1", reference: "#ABC", items: [], subtotal: 900, discountAmount: 0, shippingAmount: 60, total: 960, customerName: "Asha" });
    expect(noticeCalls.length).toBe(1);
  });

  it("THE SELLER IS TOLD THE ORDER, ITS REFERENCE, THE AMOUNT AND WHO", async () => {
    await buildOrderTurnDeps(db(), ctx).notifySeller({ ok: true, orderId: "o1", reference: "#ABC", items: [], subtotal: 900, discountAmount: 0, shippingAmount: 60, total: 960, customerName: "Asha" });
    expect(noticeCalls[0]).toEqual(["d1", { orderId: "o1", orderRef: "#ABC", amount: 960, customerName: "Asha" }]);
  });
});
