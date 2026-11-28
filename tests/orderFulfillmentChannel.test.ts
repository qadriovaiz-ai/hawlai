// THE SELLER'S ORDER EMAIL SAYS WHERE THE ORDER CAME FROM AND HOW IT WAS
// PAID — Seller Mode O4′, 28 November 2026.
//
// applyOrderSideEffects emailed "New order placed on your website" and
// "Cash on Delivery (pending)" for anything that was not Razorpay. An
// Instagram order confirmed by the seller is neither.

import { describe, it, expect, vi, beforeEach } from "vitest";

const emails: any[] = [];
vi.mock("@/lib/agents/gmailAgent", () => ({ sendEmail: async (...a: any[]) => emails.push(a) }));
vi.mock("@/lib/ads/metaConversionsApi", () => ({ sendAndLogConversion: async () => {} }));

import { applyOrderSideEffects } from "@/lib/orderFulfillment";

function db() {
  const api: any = {
    select: () => api,
    eq: () => api,
    ilike: () => api,
    is: () => api,
    limit: async () => ({ data: [], error: null }),
    update: () => api,
    delete: () => api,
    single: async () => ({ data: { gmail_email: "owner@example.test", dealership_name: "A Shop" }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
  };
  return { from: () => api };
}

const BASE = {
  orderId: "o1",
  dealershipId: "d1",
  resolvedItems: [{ product_id: "p1", name: "Clay Mug", price: 450, quantity: 2 }],
  productMap: new Map(),
  appliedDiscountId: null,
  customerName: "Asha",
  customerPhone: "9800000001",
  shippingAddress: "12 Lake Road",
  subtotal: 900,
  discountAmount: 0,
  shippingAmount: 50,
  total: 950,
};

beforeEach(() => {
  emails.length = 0;
});

describe("the seller's order email", () => {
  it("AN INSTAGRAM ORDER PAID BY UPI SAYS SO — not 'website', not 'Cash on Delivery'", async () => {
    await applyOrderSideEffects(db(), { ...BASE, paymentMethod: "upi", channel: "instagram" });
    const body = emails[0][4];
    expect(body).toMatch(/^New order placed in your Instagram DMs\./);
    expect(body).toContain("Payment: UPI to your own UPI ID — confirmed by you");
    expect(body).not.toMatch(/website|Cash on Delivery/);
  });

  it("A WEBSITE ORDER READS EXACTLY AS BEFORE", async () => {
    await applyOrderSideEffects(db(), { ...BASE, paymentMethod: "cod" });
    expect(emails[0][4]).toMatch(/^New order placed on your website\./);
    expect(emails[0][4]).toContain("Payment: Cash on Delivery (pending)");
  });
});
