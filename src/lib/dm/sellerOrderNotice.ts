// Telling the seller about a new Instagram order — WA-T of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28 November
// 2026.
//
// Seller Mode asks customers to pay the seller's own UPI ID, and nothing
// tells Hawlai the money arrived — the seller does. So the moment an
// order is placed the seller is asked, on WhatsApp: "Has this payment
// reached your UPI account?", with Yes / Not yet buttons that carry the
// order's id.
//
// ──────────────────────────────────────────────────────────────────
// A TEMPLATE, ALWAYS. The seller has usually not written to Hawlai in
// the last 24 hours, and outside that window Meta accepts nothing else.
// Inside it a template is accepted too, so this never tries to guess
// the window and pick free-form — the guess is the one thing that can
// be wrong in the direction that fails. `channelRules` holds this file
// to that: it is the only template sender, and it sends nothing else.
//
// THE IN-APP NOTIFICATION IS UNCONDITIONAL, the WhatsApp leg is not.
// The template may not be approved yet, the number may not be
// verified, Meta may refuse the send — and in every one of those cases
// the seller must still find the order. So the notification is written
// first and the WhatsApp result is returned, never thrown.
//
// OFF UNTIL THE TEMPLATE IS APPROVED. `WHATSAPP_ORDER_TEMPLATE` holds
// the approved template's name; unset means no WhatsApp leg at all. A
// send against a template Meta has not approved fails every time, so
// sending before approval would only fill the logs.
// ──────────────────────────────────────────────────────────────────

import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { emitNotification } from "@/lib/notifications/emit";
import { formatRupees } from "@/lib/payments/upiRequest";

export type SellerOrderNotice = {
  orderId: string;
  /** What the customer and the seller both call the order, e.g. "#1042". */
  orderRef: string;
  /** Rupees, the amount the customer was asked to pay. */
  amount: number;
  /** The customer's name or Instagram handle, as known. */
  customerName?: string | null;
};

/**
 * What happened on WhatsApp. The in-app notification is not reported:
 * `emitNotification` swallows its own errors and logs them, so a
 * "written: true" here would be a claim nothing checked.
 */
export type SellerNoticeResult = {
  whatsapp: "sent" | "skipped" | "failed";
  /** Why WhatsApp was skipped or failed, in words the owner can act on. */
  reason?: string;
};

/**
 * The approved template's name, or null while there is none.
 *
 * Read at send time, so approving the template is an env change plus a
 * redeploy — not a code change.
 */
export function orderTemplateName(): string | null {
  const name = (process.env.WHATSAPP_ORDER_TEMPLATE ?? "").trim();
  return name || null;
}

/**
 * The two quick-reply payloads, in the template's button order:
 * index 0 "Yes, received", index 1 "Not yet".
 *
 * THE ORDER'S ID TRAVELS IN EACH, so a tap names the order it is about.
 * Two orders waiting at once can never be confused, and nothing is
 * guessed when the reply comes back.
 */
export function paymentButtonPayloads(orderId: string): [string, string] {
  return [`pay_yes:${orderId}`, `pay_no:${orderId}`];
}

// One copy, in the payments module: the seller's notice and the
// customer's payment request must show the same amount the same way.
export { formatRupees };

/**
 * Tell the seller a new order is waiting for their payment check.
 *
 * Never throws: an order is already placed by the time this runs, and a
 * notice that failed must not undo or hide it.
 */
export async function notifySellerOfOrder(
  supabase: any,
  dealershipId: string,
  notice: SellerOrderNotice
): Promise<SellerNoticeResult> {
  const customer = String(notice.customerName ?? "").trim() || "a customer";
  const amount = formatRupees(notice.amount);

  // FIRST, AND WHATEVER HAPPENS NEXT.
  try {
    await emitNotification(supabase, {
      dealershipId,
      kind: "dm_order_received",
      title: `New Instagram order ${notice.orderRef} — ₹${amount}`,
      body: `From ${customer}. They've been sent your UPI ID. Check your UPI app, then mark it paid — stock moves only once you confirm.`,
      href: "/dashboard/website-builder?tab=orders",
      dedupeKey: `dm_order_received:${notice.orderId}`,
    });
  } catch (err: any) {
    console.error(`[seller-order-notice] couldn't write the notification for ${notice.orderId}: ${err?.message ?? err}`);
  }

  const template = orderTemplateName();
  if (!template) {
    return { whatsapp: "skipped", reason: "The WhatsApp order template isn't approved yet." };
  }

  const { data: business, error } = await supabase
    .from("dealerships")
    .select("owner_whatsapp_number, owner_whatsapp_verified")
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) {
    return { whatsapp: "failed", reason: `Couldn't read your WhatsApp number: ${error.message}` };
  }

  // ONLY A VERIFIED NUMBER — the same check the inbound webhook makes
  // before it will act as the owner. Messaging an unverified number is
  // that hole from the other side: the order would go to whoever typed
  // a number in, and their "yes" would confirm a payment.
  const phone = String(business?.owner_whatsapp_number ?? "").trim();
  if (!phone || business?.owner_whatsapp_verified !== true) {
    return { whatsapp: "skipped", reason: "Your WhatsApp number isn't connected and verified." };
  }

  try {
    await sendWhatsAppTemplate(phone, {
      name: template,
      language: "en",
      // {{1}} order, {{2}} amount, {{3}} customer — the approved body's
      // order (docs/META-SUBMISSIONS.md). Positional; do not reorder.
      variables: [notice.orderRef, amount, customer],
      buttonPayloads: paymentButtonPayloads(notice.orderId),
    });
    return { whatsapp: "sent" };
  } catch (err: any) {
    const reason = String(err?.message ?? err);
    console.error(`[seller-order-notice] WhatsApp send failed for ${notice.orderId}: ${reason}`);
    return { whatsapp: "failed", reason };
  }
}
