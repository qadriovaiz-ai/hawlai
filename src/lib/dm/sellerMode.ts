// Seller Mode: the switch, and where customers pay — F4 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// A capability any business can turn on, website or not: Hawlai takes
// orders in Instagram DMs and asks the customer to pay the SELLER's own
// UPI ID. No gateway, no cut — the money goes straight to the seller, and
// the seller confirms on WhatsApp that it arrived.
//
// THIS FILE IS THE ONE RULE FOR WHEN IT MAY BE SWITCHED ON, used by every
// door that can switch it on: the dashboard, the chat tool, and the
// approval that carries the chat tool's request out.

/**
 * Is order-taking actually live?
 *
 * FALSE UNTIL THE ORDER PIECES SHIP (O1–O4). The switch and the UPI ID can
 * be saved now, and the screen says plainly that saving them does not yet
 * make Hawlai take orders — a switch that claimed to do something it does
 * not would be the same lie the integration-health work removed.
 */
export const SELLER_MODE_TAKES_ORDERS = false;

/** The columns Seller Mode reads from `dealerships` (migration 242). */
export const SELLER_MODE_COLUMNS = "instagram_business_id, seller_upi_vpa, dm_auto_reply_enabled, instagram_selling_enabled";

/** The same shape migration 242 checks: user@handle, lower-case. */
const VPA = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/;

export type VpaResult = { ok: true; vpa: string } | { ok: false; reason: string };

/**
 * A UPI ID as typed, made into one that can be paid — or the reason not.
 *
 * Lower-cased and trimmed, because UPI IDs are case-insensitive and a
 * stray space would make a payment fail. Nothing more is "corrected": a
 * UPI ID that is wrong but well-formed cannot be caught here, and a guess
 * would send a customer's money to a stranger.
 */
export function normaliseVpa(raw: unknown): VpaResult {
  const vpa = String(raw ?? "").trim().toLowerCase();
  if (!vpa) return { ok: false, reason: "Enter your UPI ID — it looks like yourname@okhdfcbank." };
  if (/\s/.test(vpa)) return { ok: false, reason: "A UPI ID has no spaces in it." };
  if (!vpa.includes("@")) return { ok: false, reason: "A UPI ID has an @ in it, like yourname@okhdfcbank." };
  if (!VPA.test(vpa)) return { ok: false, reason: "That doesn't look like a UPI ID. Copy it from your UPI app — it looks like yourname@okhdfcbank." };
  return { ok: true, vpa };
}

/** Migration 243's upper bound, in rupees. */
export const MAX_SHIPPING_FEE = 100000;

export type FeeResult = { ok: true; fee: number } | { ok: false; reason: string };

/**
 * The flat delivery fee for DM orders (migration 243, 28 Nov 2026), as
 * typed, made into rupees — or the reason not.
 *
 * EMPTY IS ₹0, free delivery: the founder's default. A "₹" and Indian
 * comma grouping are accepted because that is how sellers write money
 * ("₹1,200"). Paise beyond two places, a negative, or text is refused —
 * never rounded, because the customer is quoted this number.
 */
export function normaliseShippingFee(raw: unknown): FeeResult {
  const text = String(raw ?? "").trim().replace(/^₹\s*/, "").replace(/,/g, "");
  if (text === "") return { ok: true, fee: 0 };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, reason: "Enter the delivery fee in rupees, like 60 or 49.50 — or leave it empty for free delivery." };
  const fee = Number(text);
  if (fee > MAX_SHIPPING_FEE) return { ok: false, reason: `A delivery fee can be at most ₹${MAX_SHIPPING_FEE.toLocaleString("en-IN")}.` };
  return { ok: true, fee };
}

type Row = Record<string, any> | null | undefined;

/**
 * Why Seller Mode cannot be switched on for this business, or null when
 * it can. The most fundamental reason first.
 */
export function sellerModeBlocker(row: Row): string | null {
  if (!row?.instagram_business_id) return "Connect Instagram first — Seller Mode takes orders in your Instagram DMs.";
  if (!row?.seller_upi_vpa) return "Save your UPI ID first — that is where customers will pay you.";
  if (!row?.dm_auto_reply_enabled) return "Turn on DM auto-reply first — Seller Mode answers through it.";
  return null;
}
