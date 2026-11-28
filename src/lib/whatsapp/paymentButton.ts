// The seller taps "Yes, received" or "Not yet" on the payment-check
// template — O3 + O4′ of docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November
// 2026.
//
// A SEPARATE PARSER FROM readInbound, ON PURPOSE. readInbound turns text
// messages into Master Chat turns and counts every other type as skipped
// — tests/whatsappInbound pins `button` in that list. A tap is not a
// sentence for a model: it is a decision about ONE order, named by the
// payload WA-T put on the button (`pay_yes:<orderId>` / `pay_no:<orderId>`).
// So taps are read here, and readInbound is unchanged.
//
// ONLY META. Gupshup's template sender refuses (client.ts), so no Gupshup
// deployment ever sent a button that could come back.

import { applyApprovalDecision } from "@/lib/approvals/decide";
import { confirmDmPayment } from "@/lib/orders/confirmDmPayment";
import { orderReference } from "@/lib/payments/upiRequest";
import { normalizePhoneNumber } from "./gupshupClient";

export type ButtonTap = { phone: string; payload: string };

/** Quick-reply taps in a Meta webhook body. Anything else is not read here. */
export function readButtonTaps(body: any): ButtonTap[] {
  const taps: ButtonTap[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field && change.field !== "messages") continue;
      for (const m of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
        if (m?.type !== "button") continue;
        const from = typeof m?.from === "string" ? m.from.trim() : "";
        const payload = typeof m?.button?.payload === "string" ? m.button.payload.trim() : "";
        if (from && payload) taps.push({ phone: normalizePhoneNumber(from), payload });
      }
    }
  }
  return taps;
}

const PAYMENT = /^pay_(yes|no):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parsePaymentPayload(payload: string): { answer: "yes" | "no"; orderId: string } | null {
  const m = PAYMENT.exec(String(payload ?? "").trim());
  return m ? { answer: m[1].toLowerCase() as "yes" | "no", orderId: m[2].toLowerCase() } : null;
}

/**
 * What to do with one tap from the business's own VERIFIED number. The
 * caller proves the number belongs to this business; this proves the
 * ORDER does, before anything happens to it.
 *
 * Returns the message to send back, or null when the payload is not a
 * payment answer (the tap is then ignored rather than guessed at).
 */
export async function handlePaymentTap(
  service: any,
  business: { id: string; owner_id: string | null },
  phone: string,
  payload: string,
  now: Date = new Date()
): Promise<string | null> {
  const tap = parsePaymentPayload(payload);
  if (!tap) return null;
  const ref = orderReference(tap.orderId);

  if (tap.answer === "no") {
    // "NOT YET" IS AN ANSWER, so no reminder follows it. The order stays
    // exactly as it is — unpaid, and confirmable later from any door.
    const { data: order, error: readError } = await service
      .from("orders")
      .select("id")
      .eq("id", tap.orderId)
      .eq("dealership_id", business.id)
      .maybeSingle();
    if (readError) return `Couldn't read order ${ref}: ${readError.message}`;
    if (!order) return "That order isn't one of yours, so nothing was changed.";
    const { error } = await service
      .from("orders")
      .update({ payment_reminder_sent_at: now.toISOString() })
      .eq("id", tap.orderId)
      .eq("dealership_id", business.id)
      .is("payment_reminder_sent_at", null);
    if (error) return `Couldn't note that for order ${ref}: ${error.message}`;
    return `Okay — order ${ref} stays unpaid for now. When the money shows in your UPI app, tap "Yes, received" on that message, or confirm it on the Orders tab.`;
  }

  // "YES, RECEIVED": through the order's own approval card when it has
  // one, so the card, the audit trail and the decision record all say
  // the same thing. Without a card (it could not be created), straight to
  // the same confirmation.
  const { data: card, error: cardError } = await service
    .from("pending_approvals")
    .select("id")
    .eq("dealership_id", business.id)
    .eq("action_type", "confirm_dm_payment")
    .eq("status", "pending")
    .eq("action_details->>order_id", tap.orderId)
    .maybeSingle();
  if (cardError) return `Couldn't read order ${ref}'s payment check: ${cardError.message}`;

  if (card?.id) {
    const outcome = await applyApprovalDecision(
      String(card.id),
      { status: "approved" },
      { userId: String(business.owner_id ?? ""), role: "owner", label: `whatsapp:${phone}` }
    );
    const result = await outcome.json().catch(() => ({} as any));
    if (!outcome.ok) return `Couldn't confirm order ${ref}: ${result?.error ?? "something went wrong"}`;
    return result?.produced?.note ?? `Order ${ref} confirmed as paid.`;
  }

  const done = await confirmDmPayment(service, business.id, tap.orderId, { now });
  return done.ok ? done.note : done.error;
}
