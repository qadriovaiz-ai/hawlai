// Asking an Instagram customer to pay the seller by UPI — the UPI piece
// of docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28
// November 2026.
//
// HAWLAI NEVER HOLDS MONEY. The payee is the seller's own saved UPI ID,
// and the customer pays it from their own UPI app. Nothing here can
// tell whether they did; the seller says so on WhatsApp (WA-T).
//
// ──────────────────────────────────────────────────────────────────
// THREE WAYS TO PAY, SO ONE ALWAYS WORKS. Instagram links http(s) in a
// DM; whether it makes a `upi://` link tappable is UNVERIFIED, and may
// differ between the Android and iOS apps. So the message carries:
//
//   1. the UPI ID and the amount as plain text — copyable into any UPI
//      app, and the one that cannot fail;
//   2. the `upi://pay` link — one tap where it is tappable;
//   3. a QR image (served by /api/public/pay/upi-qr/<orderId>) — a
//      customer on a laptop scans it, one on a phone saves and scans it
//      from the gallery in their UPI app.
// ──────────────────────────────────────────────────────────────────

import { normaliseVpa } from "@/lib/dm/sellerMode";
import { normaliseLanguage, type CopyLanguage } from "@/lib/content/language";

/** Rupees the way Indian sellers read them: 1,299 · 1,25,000 · 499.5 */
export function formatRupees(amount: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(amount);
}

/**
 * What the customer and the seller both call an order: "#" and the
 * first six characters of its id, upper-cased.
 *
 * DERIVED, NOT STORED — orders have no number column, and this needs no
 * migration. It is for people to read; anything a machine acts on (the
 * seller's WhatsApp buttons, the QR route) carries the full id, so a
 * rare clash between two references can never confuse two orders.
 */
export function orderReference(orderId: string): string {
  const hex = String(orderId ?? "").replace(/[^0-9a-f]/gi, "");
  if (hex.length < 6) throw new Error("An order id is needed to make its reference.");
  return `#${hex.slice(0, 6).toUpperCase()}`;
}

/**
 * The amount as UPI wants it: rupees with two decimals, "1299.00".
 *
 * REFUSED RATHER THAN ROUNDED when it is not a positive, finite number —
 * a payment link for ₹0 or ₹NaN is a request nobody should receive.
 */
export function upiAmount(amount: number): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("A UPI payment request needs an amount above zero.");
  }
  return amount.toFixed(2);
}

export type UpiPayment = {
  /** The seller's UPI ID, as saved. Checked again here. */
  vpa: string;
  /** The name the customer's UPI app shows as the payee — the business. */
  payeeName: string;
  amount: number;
  orderId: string;
};

/**
 * The `upi://pay` link, in the shape NPCI's linking spec documents:
 * pa (payee address), pn (payee name), am (amount), cu (currency),
 * tn (note).
 *
 * `pa` IS NOT PERCENT-ENCODED, deliberately: some UPI apps fail to read
 * `%40` back as `@`, and the VPA has already been checked to contain
 * only letters, digits, `.`, `_`, `-` and one `@`. Everything else is
 * encoded with encodeURIComponent — spaces as %20, never `+`, which some
 * apps show literally.
 *
 * NO `tr` (transaction reference). It is meant for merchant accounts,
 * and on a personal UPI ID some apps refuse a link that carries one.
 * The order reference travels in the note instead.
 */
export function upiPayLink(p: UpiPayment): string {
  const vpa = normaliseVpa(p.vpa);
  if (!vpa.ok) throw new Error(`The seller's UPI ID can't be used: ${vpa.reason}`);
  const name = String(p.payeeName ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("A UPI payment request needs the payee's name.");
  const note = `Order ${orderReference(p.orderId)}`;
  return `upi://pay?pa=${vpa.vpa}&pn=${encodeURIComponent(name)}&am=${upiAmount(p.amount)}&cu=INR&tn=${encodeURIComponent(note)}`;
}

/** Where the QR image for an order is served — an API route, not a page. */
export function upiQrPath(orderId: string): string {
  return `/api/public/pay/upi-qr/${encodeURIComponent(orderId)}`;
}

/**
 * The message the customer is sent, in the owner's chosen language.
 *
 * IT SAYS ONLY WHAT IS TRUE. The amount, where to pay, the order, and
 * that the seller confirms the payment — never "payment received", which
 * nothing here can know. No delivery promise: that is not this
 * message's to make.
 *
 * `withQr` is whether a QR image follows; the text does not mention one
 * that is not coming.
 */
export function upiRequestText(p: UpiPayment & { language?: unknown; withQr?: boolean }): string {
  const lang: CopyLanguage = normaliseLanguage(p.language);
  const vpa = normaliseVpa(p.vpa);
  if (!vpa.ok) throw new Error(`The seller's UPI ID can't be used: ${vpa.reason}`);
  const ref = orderReference(p.orderId);
  const rupees = `₹${formatRupees(p.amount)}`;
  const link = upiPayLink(p);
  const name = String(p.payeeName).replace(/\s+/g, " ").trim();

  if (lang === "hinglish") {
    return [
      `Order ${ref} ke liye ${rupees} pay karein.`,
      `UPI ID: ${vpa.vpa} (${name})`,
      `Ya yahan tap karein: ${link}`,
      ...(p.withQr ? ["Ya agle message mein QR code scan karein."] : []),
      `Pay karne ke baad yahan "paid" likh dein — ${name} payment check karke order confirm karenge.`,
    ].join("\n");
  }
  if (lang === "hindi") {
    return [
      `ऑर्डर ${ref} के लिए ${rupees} का भुगतान करें।`,
      `UPI ID: ${vpa.vpa} (${name})`,
      `या यहाँ टैप करें: ${link}`,
      ...(p.withQr ? ["या अगले संदेश में QR कोड स्कैन करें।"] : []),
      `भुगतान के बाद यहाँ "paid" लिखें — ${name} भुगतान देखकर ऑर्डर कन्फर्म करेंगे।`,
    ].join("\n");
  }
  return [
    `To pay for order ${ref}: ${rupees}`,
    `UPI ID: ${vpa.vpa} (${name})`,
    `Or tap: ${link}`,
    ...(p.withQr ? ["Or scan the QR code in the next message."] : []),
    `Once you've paid, reply "paid" here — ${name} will check the payment and confirm your order.`,
  ].join("\n");
}
