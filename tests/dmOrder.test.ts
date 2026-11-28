// AN ORDER FROM AN INSTAGRAM DM — O2 of docs/PLAN-INSTAGRAM-SELLER-MODE.md
// (UPI-direct revision), 28 November 2026.
//
// One function writes every order row, for the storefront and for DMs.
// A DM order is written `new` with NOTHING ELSE: no stock moves until the
// seller confirms the customer's UPI payment (O3/O4′), because only the
// seller can know the money arrived.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { code } from "./helpers/source";

const sideEffects = vi.fn();
vi.mock("@/lib/orderFulfillment", () => ({ applyOrderSideEffects: (...a: any[]) => sideEffects(...a) }));

// ---- one business's database -------------------------------------------
let business: Record<string, any> | null;
let businessError: any;
let tablesRead: string[];
let products: Record<string, any>[];
let insertError: any;
let inserted: Record<string, any>[];
let writes: { table: string; op: string }[];

function db() {
  return {
    from: (table: string) => {
      tablesRead.push(table);
      const api: any = {
        select: () => api,
        eq: () => api,
        in: () => api,
        maybeSingle: async () => (table === "dealerships" ? { data: business, error: businessError } : { data: null, error: null }),
        then: (resolve: any) => resolve({ data: table === "products" ? products : [], error: null }),
        insert: (row: Record<string, any>) => {
          writes.push({ table, op: "insert" });
          if (table === "orders") inserted.push(row);
          return { select: () => ({ single: async () => (insertError ? { data: null, error: insertError } : { data: { id: row.id ?? "generated" }, error: null }) }) };
        },
        update: () => {
          writes.push({ table, op: "update" });
          return api;
        },
      };
      return api;
    },
  };
}

import { createDmOrder } from "@/lib/orders/createDmOrder";
import { orderRow } from "@/lib/orders/insertOrder";
import { orderReference } from "@/lib/payments/upiRequest";

const INPUT = {
  dealershipId: "d1",
  customerName: "Asha",
  customerPhone: "+91 98000 00001",
  shippingAddress: "12 Lake Road, Pune 411001",
  items: [{ productId: "p1", quantity: 2 }],
};

beforeEach(() => {
  sideEffects.mockReset();
  business = { instagram_business_id: "17841", seller_upi_vpa: "shop@okhdfcbank", dm_auto_reply_enabled: true, instagram_selling_enabled: true, seller_shipping_fee: 50 };
  businessError = null;
  tablesRead = [];
  products = [{ id: "p1", name: "Clay Mug", price: 450, is_active: true, inventory_count: 5, kind: "product" }];
  insertError = null;
  inserted = [];
  writes = [];
});

describe("1. THE ORDER IS WRITTEN — AND NOTHING ELSE HAPPENS", () => {
  it("AN INSTAGRAM ORDER, UPI, PENDING, `new` — at the catalog's price, plus the seller's flat delivery fee", async () => {
    const r = await createDmOrder(db(), INPUT);
    expect(r).toMatchObject({ ok: true, subtotal: 900, shippingAmount: 50, total: 950 });
    expect(inserted.length).toBe(1);
    expect(inserted[0]).toMatchObject({
      dealership_id: "d1",
      website_id: null,
      channel: "instagram",
      payment_method: "upi",
      payment_status: "pending",
      status: "new",
      customer_name: "Asha",
      total: 950,
      items: [{ product_id: "p1", name: "Clay Mug", price: 450, quantity: 2 }],
    });
  });

  it("THE UPI REFERENCE IS WRITTEN IN THE SAME INSERT, and is the id the order really has", async () => {
    const r = await createDmOrder(db(), INPUT);
    if (!r.ok) throw new Error(r.error);
    expect(inserted[0].id).toBe(r.orderId);
    expect(inserted[0].upi_reference).toBe(orderReference(r.orderId));
    expect(r.reference).toBe(orderReference(r.orderId));
    expect(writes.filter((w) => w.table === "orders")).toEqual([{ table: "orders", op: "insert" }]);
  });

  it("NO SIDE EFFECTS: no stock moved, no discount counted, no email, no Purchase event", async () => {
    await createDmOrder(db(), INPUT);
    expect(sideEffects).not.toHaveBeenCalled();
    // The only write anywhere is the order row itself.
    expect(writes).toEqual([{ table: "orders", op: "insert" }]);
  });

  it("A PRICE IN THE CONVERSATION IS NEVER THE PRICE CHARGED", async () => {
    await createDmOrder(db(), { ...INPUT, items: [{ productId: "p1", quantity: 1, price: 1 } as any] });
    expect(inserted[0].subtotal).toBe(450);
  });

  it("A FEE OF ₹0 IS FREE DELIVERY — the founder's default (migration 243)", async () => {
    business!.seller_shipping_fee = 0;
    expect(await createDmOrder(db(), INPUT)).toMatchObject({ ok: true, shippingAmount: 0, total: 900 });
  });

  it("THE FEE IS FLAT — the same on a bigger order, no threshold", async () => {
    const r = await createDmOrder(db(), { ...INPUT, items: [{ productId: "p1", quantity: 5 }] });
    expect(r).toMatchObject({ ok: true, subtotal: 2250, shippingAmount: 50, total: 2300 });
  });

  it("THE WEBSITE'S SHIPPING RULES ARE NOT READ — the Seller Mode fee is the only one", async () => {
    await createDmOrder(db(), INPUT);
    expect(tablesRead).not.toContain("websites");
  });

  it("A FEE THAT ISN'T A VALID AMOUNT REFUSES THE ORDER, never prices it as free", async () => {
    for (const bad of [-5, "abc"]) {
      business!.seller_shipping_fee = bad;
      inserted = [];
      const r = await createDmOrder(db(), INPUT);
      expect(r, String(bad)).toEqual({ ok: false, error: "The delivery fee setting isn't a valid amount" });
      expect(inserted).toEqual([]);
    }
  });
});

describe("2. NOT TAKEN WHEN THE SELLER HAS SAID NOT TO", () => {
  const refusals: [string, () => void, RegExp][] = [
    ["Seller Mode switched off", () => (business!.instagram_selling_enabled = false), /Seller Mode is off/],
    ["the UPI ID cleared", () => (business!.seller_upi_vpa = null), /UPI ID/],
    ["DM replies switched off", () => (business!.dm_auto_reply_enabled = false), /DM auto-reply/],
    ["no such business", () => (business = null), /Seller Mode is off/],
    ["the settings unreadable", () => (businessError = { message: "boom" }), /Couldn't read the shop's settings/],
  ];
  for (const [what, arrange, why] of refusals) {
    it(`REFUSED, AND NOTHING WRITTEN: ${what}`, async () => {
      arrange();
      const r = await createDmOrder(db(), INPUT);
      expect(r.ok).toBe(false);
      expect((r as any).error).toMatch(why);
      expect(inserted).toEqual([]);
    });
  }
});

describe("3. AN ORDER THAT IS NOT WHOLE IS NOT WRITTEN", () => {
  it("A FRACTIONAL, ZERO OR HUNDREDFOLD QUANTITY IS REFUSED — a conversation is where '1.5' appears", async () => {
    for (const quantity of [1.5, 0, -1, 100, NaN]) {
      const r = await createDmOrder(db(), { ...INPUT, items: [{ productId: "p1", quantity }] });
      expect(r.ok, String(quantity)).toBe(false);
    }
    expect(await createDmOrder(db(), { ...INPUT, items: [] })).toMatchObject({ ok: false });
    expect(inserted).toEqual([]);
  });

  it("NO NAME, NO REACHABLE PHONE, NO ADDRESS — refused with what is missing", async () => {
    expect(await createDmOrder(db(), { ...INPUT, customerName: " " })).toMatchObject({ ok: false, error: expect.stringMatching(/name/) });
    expect(await createDmOrder(db(), { ...INPUT, customerPhone: "call me" })).toMatchObject({ ok: false, error: expect.stringMatching(/phone/) });
    expect(await createDmOrder(db(), { ...INPUT, shippingAddress: "Pune" })).toMatchObject({ ok: false, error: expect.stringMatching(/address/) });
    expect(inserted).toEqual([]);
  });

  it("MORE THAN THE STOCK IS REFUSED with how many are left", async () => {
    const r = await createDmOrder(db(), { ...INPUT, items: [{ productId: "p1", quantity: 6 }] });
    expect(r).toEqual({ ok: false, error: 'Only 5 of "Clay Mug" left in stock' });
  });

  it("ANOTHER BUSINESS'S PRODUCT IS NOT FOUND — pricing reads this business only", async () => {
    products = [];
    expect(await createDmOrder(db(), INPUT)).toMatchObject({ ok: false });
    expect(inserted).toEqual([]);
  });

  it("A TOTAL THAT MOVED SINCE THE CUSTOMER SAID YES IS REFUSED — O1's read-back", async () => {
    const r = await createDmOrder(db(), { ...INPUT, expectedTotal: 900 });
    expect(r).toEqual({ ok: false, error: "The price changed since the customer confirmed it.", priceChanged: true });
    expect(inserted).toEqual([]);
    expect(await createDmOrder(db(), { ...INPUT, expectedTotal: 950 })).toMatchObject({ ok: true, total: 950 });
  });

  it("A SAVE THAT FAILS IS SAID, never reported as an order", async () => {
    insertError = { message: "constraint" };
    expect(await createDmOrder(db(), INPUT)).toEqual({ ok: false, error: "The order couldn't be saved." });
  });
});

describe("4. ONE ROW SHAPE FOR EVERY ORDER", () => {
  const base = {
    dealershipId: "d1",
    websiteId: "w1",
    customer: { name: " Asha ", phone: " 98000 ", address: " Pune road " },
    pricing: { resolvedItems: [], subtotal: 10, discountAmount: 0, appliedDiscountId: null, shippingAmount: 0, total: 10 },
  };

  it("A STOREFRONT ORDER SAYS 'website' AND CARRIES NO UPI REFERENCE", () => {
    const row = orderRow({ ...base, channel: "website", payment: { method: "cod", status: "pending" } });
    expect(row).toMatchObject({ channel: "website", payment_method: "cod", status: "new", customer_name: "Asha" });
    expect(row).not.toHaveProperty("upi_reference");
    expect(row).not.toHaveProperty("id");
  });

  it("A RAZORPAY ORDER CARRIES ITS THREE PROOFS", () => {
    const row = orderRow({ ...base, channel: "website", payment: { method: "razorpay", status: "paid", razorpayOrderId: "o", razorpayPaymentId: "p", razorpaySignature: "s" } });
    expect(row).toMatchObject({ payment_status: "paid", razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" });
  });

  it("A DISCOUNT CODE IS RECORDED ONLY WHEN IT APPLIED", () => {
    expect(orderRow({ ...base, channel: "website", payment: { method: "cod", status: "pending" }, pricing: { ...base.pricing, discountCode: " diwali " } }).discount_code).toBeNull();
    expect(orderRow({ ...base, channel: "website", payment: { method: "cod", status: "pending" }, pricing: { ...base.pricing, discountCode: " diwali ", appliedDiscountId: "dc1" } }).discount_code).toBe("DIWALI");
  });

  it("NOTHING ELSE IN THE APP WRITES AN ORDER ROW — read with comments stripped", () => {
    const SRC = join(__dirname, "../src");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    const writers = walk(SRC)
      .map((p) => ({ path: relative(SRC, p).replace(/\\/g, "/"), text: code(p) }))
      .filter((f) => /from\(\s*["']orders["']\s*\)\s*\.\s*insert\s*\(/.test(f.text))
      .map((f) => f.path);
    expect(writers).toEqual(["lib/orders/insertOrder.ts"]);
  });

  it("BOTH STOREFRONT PATHS GO THROUGH IT, and keep their own side-effects call", () => {
    for (const path of ["src/app/api/public/orders/route.ts", "src/app/api/public/orders/verify-payment/route.ts"]) {
      const src = code(path);
      expect(src, path).toMatch(/await insertOrder\(supabase, \{[\s\S]*?channel: "website"/);
      expect(src, path).toMatch(/await applyOrderSideEffects\(supabase, \{/);
    }
  });

  it("AND THE DM PATH NEVER CALLS THE SIDE EFFECTS", () => {
    expect(code("src/lib/orders/createDmOrder.ts")).not.toMatch(/applyOrderSideEffects\s*\(/);
  });
});
