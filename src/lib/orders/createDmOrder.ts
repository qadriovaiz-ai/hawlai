// Creating an order from an Instagram DM — O2 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28 November
// 2026.
//
// O1 (the conversation) calls this once the customer has said "yes" to
// the read-back. Nothing calls it before then, and SELLER_MODE_TAKES_ORDERS
// stays false until the order pieces are all in.
//
// ──────────────────────────────────────────────────────────────────
// THE ORDER IS WRITTEN `new`, AND NOTHING ELSE HAPPENS. No stock moves,
// no discount use is counted, no email, no Meta Purchase event —
// `applyOrderSideEffects` is NOT called here. In this flow the money goes
// straight to the seller's UPI ID and only the seller can say it arrived,
// so stock moves when they confirm the payment (O3/O4′), not when a
// customer types "yes". An order nobody pays for must leave the shelf as
// it was.
//
// THE PRICE IS THE CATALOG'S, re-read here, never the conversation's.
// Whatever the agent quoted, the row carries what the products table
// says now — the same rule the storefront has always kept against a
// tampered cart.
//
// SELLER MODE IS READ NOW. A seller who switched it off, or cleared the
// UPI ID, between the quote and the "yes" has said not to take this
// order — so it is refused, not written.
// ──────────────────────────────────────────────────────────────────

import { resolveBusinessOrderPricing } from "@/lib/orderPricing";
import { SELLER_MODE_COLUMNS, sellerModeBlocker } from "@/lib/dm/sellerMode";
import { orderReference } from "@/lib/payments/upiRequest";
import { insertOrder } from "./insertOrder";
import type { ResolvedOrderItem } from "@/lib/orderPricing";

export type DmOrderInput = {
  dealershipId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  customerEmail?: string | null;
  items: { productId: string; quantity: number }[];
  discountCode?: string | null;
  /**
   * The total the customer said yes to (O1's read-back). When given, an
   * order whose price has moved since is REFUSED rather than written —
   * the customer agreed to a number, and a different one is not theirs.
   */
  expectedTotal?: number;
};

export type DmOrderResult =
  | {
      ok: true;
      orderId: string;
      /** "#6B1F0C" — what the customer and the seller call it. */
      reference: string;
      items: ResolvedOrderItem[];
      subtotal: number;
      discountAmount: number;
      shippingAmount: number;
      total: number;
    }
  | { ok: false; error: string; priceChanged?: true };

/** The same minimums the storefront checkout enforces. */
function customerProblem(i: DmOrderInput): string | null {
  if (String(i.customerName ?? "").trim().length < 2) return "The customer's name is needed.";
  if (String(i.customerPhone ?? "").replace(/\D/g, "").length < 8) return "A phone number the seller can reach is needed.";
  if (String(i.shippingAddress ?? "").trim().length < 5) return "A delivery address is needed.";
  return null;
}

export async function createDmOrder(supabase: any, input: DmOrderInput): Promise<DmOrderResult> {
  const problem = customerProblem(input);
  if (problem) return { ok: false, error: problem };

  // WHOLE UNITS, 1 TO 99. The storefront's pricing passes a fractional
  // quantity through (tests/orderPricing documents that gap); an order
  // assembled from a conversation is exactly where "1.5" could appear,
  // so it is refused here rather than priced.
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "No items in the order." };
  for (const it of input.items) {
    if (!it?.productId || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 99) {
      return { ok: false, error: "Each item needs a product and a whole quantity from 1 to 99." };
    }
  }

  const { data: business, error: businessError } = await supabase
    .from("dealerships")
    // seller_shipping_fee: migration 243 — the only delivery charge on a DM order.
    .select(`${SELLER_MODE_COLUMNS}, seller_shipping_fee`)
    .eq("id", input.dealershipId)
    .maybeSingle();
  if (businessError) return { ok: false, error: "Couldn't read the shop's settings, so no order was placed." };
  if (!business?.instagram_selling_enabled) return { ok: false, error: "Seller Mode is off, so orders aren't being taken in DMs." };
  const blocker = sellerModeBlocker(business);
  if (blocker) return { ok: false, error: blocker };

  const pricing = await resolveBusinessOrderPricing(supabase, input.dealershipId, input.items, input.discountCode, Number(business.seller_shipping_fee ?? 0));
  if (!pricing.ok) return { ok: false, error: pricing.error };
  if (!(pricing.total > 0)) return { ok: false, error: "This order comes to nothing, so there is nothing to pay." };
  if (input.expectedTotal !== undefined && Math.round(pricing.total * 100) !== Math.round(input.expectedTotal * 100)) {
    return { ok: false, error: "The price changed since the customer confirmed it.", priceChanged: true };
  }

  // THE ID IS CHOSEN HERE so the UPI reference can be written in the same
  // insert — no second write that could fail and leave an order the
  // seller cannot match to a payment.
  const orderId = crypto.randomUUID();
  const reference = orderReference(orderId);

  const saved = await insertOrder(supabase, {
    id: orderId,
    dealershipId: input.dealershipId,
    // Not from a website, whether or not the business has one.
    websiteId: null,
    channel: "instagram",
    customer: { name: input.customerName, phone: input.customerPhone, email: input.customerEmail, address: input.shippingAddress },
    pricing: {
      resolvedItems: pricing.resolvedItems,
      subtotal: pricing.subtotal,
      discountAmount: pricing.discountAmount,
      appliedDiscountId: pricing.appliedDiscountId,
      discountCode: input.discountCode,
      shippingAmount: pricing.shippingAmount,
      total: pricing.total,
    },
    payment: { method: "upi", status: "pending", upiReference: reference },
  });
  if (!saved.ok) return { ok: false, error: "The order couldn't be saved." };

  return {
    ok: true,
    orderId: saved.id,
    reference,
    items: pricing.resolvedItems,
    subtotal: pricing.subtotal,
    discountAmount: pricing.discountAmount,
    shippingAmount: pricing.shippingAmount,
    total: pricing.total,
  };
}
