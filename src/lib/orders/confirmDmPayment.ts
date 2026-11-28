// The seller says the UPI payment arrived — O3 + O4′ of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28 November
// 2026.
//
// ONE FUNCTION, FOUR DOORS: the seller's "Yes, received" tap on WhatsApp,
// a typed "haan CODE", the approval card on the dashboard, and the
// Orders tab. Whichever comes first does it; the rest find it done.
//
// ──────────────────────────────────────────────────────────────────
// WHAT HAPPENS, IN THIS ORDER
//
//   1. THE ORDER IS CLAIMED: paid + confirmed, only if it is still an
//      unpaid, new Instagram order of THIS business. A second door, or
//      the same tap delivered twice, matches nothing and does nothing.
//   2. applyOrderSideEffects — HERE, and nowhere earlier. Stock moves at
//      payment confirmation (the founder's decision): an order nobody
//      paid for must leave the shelf as it was.
//   3. The customer gets a text invoice — only inside Meta's 24-hour
//      window, dated from the customer's own last message. Outside it,
//      Instagram allows no automatic message, and the seller is told to
//      send it themselves (FU2 will make that one tap).
//
// IT NEVER GUESSES THAT MONEY ARRIVED. It runs only on the seller's own
// word, from a door that proved it was the seller.
// ──────────────────────────────────────────────────────────────────

import { applyOrderSideEffects } from "@/lib/orderFulfillment";
import { orderReference, formatRupees } from "@/lib/payments/upiRequest";
import { readDmThread, insideMessagingWindow } from "@/lib/dm/thread";
import { sendInstagramDmReply } from "@/lib/instagram/dm";
import { INSTAGRAM_TOKEN_SELECT, readInstagramToken } from "@/lib/crypto/oauthSecrets";
import { businessDisplayName } from "@/lib/business/displayName";
import { normaliseLanguage, type CopyLanguage } from "@/lib/content/language";
import type { ResolvedOrderItem } from "@/lib/orderPricing";

export type ConfirmResult =
  | { ok: true; note: string; reference: string; invoice: "sent" | "not_sent" }
  | { ok: false; error: string; status: number };

const ORDER_COLUMNS =
  "id, dealership_id, customer_name, customer_phone, customer_email, shipping_address, items, subtotal, discount_amount, shipping_amount, total, instagram_sender_id, upi_reference, created_at";

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  shipping_address: string;
  items: ResolvedOrderItem[];
  subtotal: number;
  discount_amount: number | null;
  shipping_amount: number | null;
  total: number;
  instagram_sender_id: string | null;
  upi_reference: string | null;
  created_at: string;
};

const INVOICE: Record<CopyLanguage, { head: string; title: string; date: string; delivery: string; free: string; total: string }> = {
  english: { head: "Payment received — thank you!", title: "Invoice — order", date: "Date", delivery: "Delivery", free: "Free", total: "Total paid" },
  hinglish: { head: "Payment mil gaya — shukriya!", title: "Invoice — order", date: "Date", delivery: "Delivery", free: "Free", total: "Total paid" },
  hindi: { head: "भुगतान मिल गया — धन्यवाद!", title: "बिल — ऑर्डर", date: "तारीख़", delivery: "डिलीवरी", free: "मुफ़्त", total: "कुल भुगतान" },
};

/**
 * The invoice the customer is sent, from the order row alone. Plain text;
 * a PDF is phase 2. Every number is the order's own.
 */
export function invoiceText(o: Pick<Order, "id" | "items" | "shipping_amount" | "total" | "upi_reference">, businessName: string, language: CopyLanguage, at: Date): string {
  const L = INVOICE[language];
  const ref = o.upi_reference || orderReference(o.id);
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(at);
  const shipping = Number(o.shipping_amount ?? 0);
  return [
    L.head,
    `${L.title} ${ref}`,
    `${L.date}: ${date}`,
    ...(o.items ?? []).map((it) => `• ${it.quantity} × ${it.name} — ₹${formatRupees(Number(it.price) * it.quantity)}`),
    `${L.delivery}: ${shipping > 0 ? `₹${formatRupees(shipping)}` : L.free}`,
    `${L.total}: ₹${formatRupees(Number(o.total))}`,
    businessName,
  ].join("\n");
}

/** Why an order could not be claimed, read back so the seller is told the truth. */
async function whyNotClaimed(service: any, dealershipId: string, orderId: string): Promise<ConfirmResult> {
  const { data, error } = await service
    .from("orders")
    .select("id, channel, payment_status, status")
    .eq("id", orderId)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (error) return { ok: false, error: `Couldn't read the order: ${error.message}`, status: 500 };
  const ref = orderReference(orderId);
  if (!data) return { ok: false, error: "That order isn't one of yours, so nothing was done.", status: 404 };
  if (data.channel !== "instagram") return { ok: false, error: `Order ${ref} isn't an Instagram order, so it isn't confirmed this way.`, status: 400 };
  if (data.payment_status === "paid") return { ok: false, error: `Order ${ref} is already confirmed as paid, so nothing was done again.`, status: 409 };
  if (data.status === "cancelled") return { ok: false, error: `Order ${ref} was cancelled, so it wasn't confirmed.`, status: 409 };
  return { ok: false, error: `Order ${ref} has moved on (${data.status}), so nothing was done.`, status: 409 };
}

export async function confirmDmPayment(
  service: any,
  dealershipId: string,
  orderId: string,
  opts: { now?: Date; resolveApproval?: { userId: string } | null } = {}
): Promise<ConfirmResult> {
  const now = opts.now ?? new Date();

  // ---- 1. the claim ----------------------------------------------------
  const { data: claimed, error: claimError } = await service
    .from("orders")
    .update({ payment_status: "paid", status: "confirmed", updated_at: now.toISOString() })
    .eq("id", orderId)
    .eq("dealership_id", dealershipId)
    .eq("channel", "instagram")
    .eq("payment_status", "pending")
    .eq("status", "new")
    .select(ORDER_COLUMNS);
  if (claimError) return { ok: false, error: `Couldn't confirm the order: ${claimError.message}`, status: 500 };
  if (!Array.isArray(claimed) || claimed.length !== 1) return whyNotClaimed(service, dealershipId, orderId);
  const order = claimed[0] as Order;
  const ref = order.upi_reference || orderReference(order.id);
  const notes: string[] = [`Order ${ref} confirmed as paid (₹${formatRupees(Number(order.total))}).`];

  // ---- 2. stock and the rest, now ------------------------------------
  const items: ResolvedOrderItem[] = Array.isArray(order.items) ? order.items : [];
  const { data: products, error: productsError } = await service
    .from("products")
    .select("id, inventory_count")
    .in("id", items.map((i) => i.product_id))
    .eq("dealership_id", dealershipId);
  // A STOCK READ THAT FAILED IS SAID, not passed off as "stock updated":
  // with no product rows the decrement below silently does nothing.
  if (productsError) notes.push("Your stock couldn't be read, so it wasn't reduced — adjust it on the Products tab.");
  try {
    await applyOrderSideEffects(service, {
      orderId: order.id,
      dealershipId,
      resolvedItems: items,
      productMap: new Map((products ?? []).map((p: any) => [p.id, { inventory_count: p.inventory_count }])),
      appliedDiscountId: null,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      shippingAddress: order.shipping_address,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount ?? 0),
      shippingAmount: Number(order.shipping_amount ?? 0),
      total: Number(order.total),
      paymentMethod: "upi",
      channel: "instagram",
      trackingConsent: false,
    });
    if (!productsError) notes.push("Stock updated.");
  } catch (err: any) {
    notes.push(`The order is confirmed, but updating stock hit a problem (${err?.message ?? err}) — check the Products tab.`);
  }

  // ---- 3. the invoice -------------------------------------------------
  let invoice: "sent" | "not_sent" = "not_sent";
  const reason = await sendInvoice(service, dealershipId, order, now).catch((err: any) => `it couldn't be sent (${err?.message ?? err})`);
  if (reason === null) {
    invoice = "sent";
    notes.push("The customer has been sent their invoice on Instagram.");
  } else {
    notes.push(`The invoice wasn't sent to the customer: ${reason}.`);
  }

  // ---- the card, if this came from another door ----------------------
  if (opts.resolveApproval) {
    const { error: approvalError } = await service
      .from("pending_approvals")
      .update({ status: "approved", reviewed_by: opts.resolveApproval.userId, reviewed_at: now.toISOString(), result_details: { orderConfirmed: order.id } })
      .eq("dealership_id", dealershipId)
      .eq("action_type", "confirm_dm_payment")
      .eq("status", "pending")
      .eq("action_details->>order_id", order.id);
    if (approvalError) console.error(`[confirm-dm-payment] couldn't close the card for ${order.id}: ${approvalError.message}`);
  }

  return { ok: true, note: notes.join(" "), reference: ref, invoice };
}

/** null when sent; otherwise why not, in words the seller can act on. */
async function sendInvoice(service: any, dealershipId: string, order: Order, now: Date): Promise<string | null> {
  if (!order.instagram_sender_id) return "this order doesn't record which Instagram customer placed it";

  // META'S RULE: automatic only inside 24 hours of the customer's OWN
  // last message (thread.ts dates it from that, not from our messages).
  const thread = await readDmThread(service, dealershipId, "instagram", order.instagram_sender_id);
  if (!insideMessagingWindow(thread.lastCustomerAt, now)) {
    return "the customer last wrote more than 24 hours ago, so Instagram doesn't allow an automatic message — send it to them yourself";
  }

  const [{ data: business, error }, { data: brand }] = await Promise.all([
    service.from("dealerships").select(`dealership_name, instagram_business_id, ${INSTAGRAM_TOKEN_SELECT}`).eq("id", dealershipId).maybeSingle(),
    service.from("brand_profiles").select("preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
  ]);
  if (error) return `the shop's Instagram connection couldn't be read (${error.message})`;
  const token = business ? readInstagramToken(business) : null;
  if (!token || !business?.instagram_business_id) return "Instagram isn't connected right now";

  const text = invoiceText(order, businessDisplayName(business.dealership_name), normaliseLanguage(brand?.preferred_language), now);
  await sendInstagramDmReply(token, business.instagram_business_id, order.instagram_sender_id, text);

  // LOGGED LIKE ANY MESSAGE TO THIS CUSTOMER, so the next reply's memory
  // has it. No incoming text: the business started this one.
  const { error: logError } = await service.from("auto_reply_log").insert({
    dealership_id: dealershipId,
    channel: "dm_instagram",
    source_id: order.instagram_sender_id,
    incoming_text: null,
    reply_text: text,
    success: true,
    error: null,
  });
  if (logError) console.error(`[confirm-dm-payment] invoice sent but not logged for ${order.id}: ${logError.message}`);
  return null;
}
