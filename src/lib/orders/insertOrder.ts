// Writing an order row — ONE place, for every way an order is placed.
// O2 of docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// Before this, the storefront's cash-on-delivery path and its Razorpay
// verify path each wrote their own `orders.insert({...})` — two copies
// of the same twenty columns. A third copy for Instagram orders is how
// they drift: a column added to one and not the others.
//
// IT WRITES THE ROW AND NOTHING ELSE. Stock, discount usage, the seller's
// email and the Meta Purchase event are `applyOrderSideEffects`, and
// WHEN they run is the caller's decision — at once for cash on delivery,
// after a verified payment for Razorpay, and only when the seller
// confirms the payment for an Instagram order. Folding them in here would
// take that decision away from the one place that knows.
//
// A FUNCTION, NOT A ROUTE CALL: a route that fetches its own app gets a
// Vercel 508 after about four hops (CLAUDE.md, "No self-calls").

import type { ResolvedOrderItem } from "@/lib/orderPricing";

export type OrderChannel = "website" | "instagram";

export type NewOrder = {
  /** Chosen by the caller when it needs the id before the row exists. */
  id?: string;
  dealershipId: string;
  websiteId: string | null;
  channel: OrderChannel;
  /** Whose Instagram DM placed it (migration 245) — where the invoice goes. */
  instagramSenderId?: string | null;
  customer: { name: string; phone: string; email?: string | null; address: string };
  pricing: {
    resolvedItems: ResolvedOrderItem[];
    subtotal: number;
    discountAmount: number;
    appliedDiscountId: string | null;
    discountCode?: string | null;
    shippingAmount: number;
    total: number;
  };
  payment:
    | { method: "cod"; status: "pending" }
    | { method: "upi"; status: "pending"; upiReference: string }
    | { method: "razorpay"; status: "paid"; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string };
  attribution?: { utm_campaign: string | null; utm_source: string | null; meta_campaign_id: string | null } | null;
};

/** The row exactly as it is written. Pure, so a test can read it. */
export function orderRow(o: NewOrder): Record<string, unknown> {
  const p = o.payment;
  return {
    ...(o.id ? { id: o.id } : {}),
    dealership_id: o.dealershipId,
    website_id: o.websiteId,
    channel: o.channel,
    ...(o.instagramSenderId ? { instagram_sender_id: o.instagramSenderId } : {}),
    utm_campaign: o.attribution?.utm_campaign ?? null,
    utm_source: o.attribution?.utm_source ?? null,
    meta_campaign_id: o.attribution?.meta_campaign_id ?? null,
    customer_name: String(o.customer.name).trim(),
    customer_phone: String(o.customer.phone).trim(),
    customer_email: o.customer.email ? String(o.customer.email).trim() : null,
    shipping_address: String(o.customer.address).trim(),
    items: o.pricing.resolvedItems,
    subtotal: o.pricing.subtotal,
    // The code as the customer typed it, normalised — but only when it
    // actually applied. A rejected code never reaches here (pricing
    // refuses the order), so this is belt and braces.
    discount_code: o.pricing.appliedDiscountId && o.pricing.discountCode ? String(o.pricing.discountCode).trim().toUpperCase() : null,
    discount_amount: o.pricing.discountAmount,
    shipping_amount: o.pricing.shippingAmount,
    total: o.pricing.total,
    payment_method: p.method,
    payment_status: p.status,
    // Every order starts `new` — the Orders tab shows it as pending until
    // the seller moves it on.
    status: "new",
    ...(p.method === "upi" ? { upi_reference: p.upiReference } : {}),
    ...(p.method === "razorpay"
      ? { razorpay_order_id: p.razorpayOrderId, razorpay_payment_id: p.razorpayPaymentId, razorpay_signature: p.razorpaySignature }
      : {}),
  };
}

export async function insertOrder(
  supabase: any,
  o: NewOrder
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.from("orders").insert(orderRow(o)).select("id").single();
  if (error || !data?.id) return { ok: false, error: error?.message ?? "The order wasn't saved." };
  return { ok: true, id: data.id };
}
